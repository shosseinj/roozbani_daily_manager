import { bindings, type D1PreparedStatementLite, type TaskRow } from "../../../lib/server";
import { normalizeOperations, type AgentProposal, type TaskOperation, type UpdateTaskOperation } from "../domain/task-tools";

type ProposalRow = {
  id: string;
  owner_id: string;
  summary: string;
  operations_json: string;
  status: AgentProposal["status"];
  created_at: string;
  expires_at: string;
  applied_at: string | null;
  undone_at: string | null;
};

type EventRow = {
  id: string;
  operation_type: TaskOperation["type"];
  task_id: string;
  before_json: string | null;
  after_json: string | null;
};

export async function createTaskProposal(ownerId: string, summary: string, rawOperations: unknown) {
  const operations = normalizeOperations(rawOperations);
  if (!operations.length) throw new Error("NO_VALID_OPERATIONS");
  await verifyTargets(ownerId, operations);

  const id = crypto.randomUUID();
  const createdAt = new Date();
  const expiresAt = new Date(createdAt.getTime() + 24 * 60 * 60 * 1000);
  await bindings().DB.prepare(`INSERT INTO agent_action_proposals
    (id,owner_id,summary,operations_json,status,created_at,expires_at,applied_at,undone_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      id, ownerId, summary.trim().slice(0, 500) || "پیشنهاد تغییر برنامه",
      JSON.stringify(operations), "pending", createdAt.toISOString(), expiresAt.toISOString(), null, null,
    ).run();
  return getProposal(ownerId, id);
}

export async function listAgentActivity(ownerId: string) {
  const now = new Date().toISOString();
  await bindings().DB.prepare(`UPDATE agent_action_proposals SET status='expired'
    WHERE owner_id=? AND status='pending' AND expires_at<=?`).bind(ownerId, now).run();

  const [messages, proposals] = await Promise.all([
    bindings().DB.prepare(`SELECT id,role,content,created_at FROM agent_messages
      WHERE owner_id=? ORDER BY created_at DESC LIMIT 40`).bind(ownerId).all(),
    bindings().DB.prepare(`SELECT * FROM agent_action_proposals
      WHERE owner_id=? ORDER BY created_at DESC LIMIT 15`).bind(ownerId).all<ProposalRow>(),
  ]);
  return {
    messages: [...(messages.results || [])].reverse(),
    proposals: (proposals.results || []).map(mapProposal),
  };
}

export async function getProposal(ownerId: string, proposalId: string) {
  const row = await bindings().DB.prepare("SELECT * FROM agent_action_proposals WHERE id=? AND owner_id=?")
    .bind(proposalId, ownerId).first<ProposalRow>();
  return row ? mapProposal(row) : null;
}

export async function rejectProposal(ownerId: string, proposalId: string) {
  const result = await getProposal(ownerId, proposalId);
  if (!result) throw new Error("PROPOSAL_NOT_FOUND");
  if (result.status !== "pending") throw new Error("PROPOSAL_NOT_PENDING");
  await bindings().DB.prepare(`UPDATE agent_action_proposals SET status='rejected'
    WHERE id=? AND owner_id=? AND status='pending'`).bind(proposalId, ownerId).run();
  return getProposal(ownerId, proposalId);
}

export async function applyProposal(ownerId: string, proposalId: string) {
  const proposal = await getProposal(ownerId, proposalId);
  if (!proposal) throw new Error("PROPOSAL_NOT_FOUND");
  if (proposal.status !== "pending") throw new Error("PROPOSAL_NOT_PENDING");
  if (proposal.expires_at <= new Date().toISOString()) throw new Error("PROPOSAL_EXPIRED");
  await verifyTargets(ownerId, proposal.operations);

  const db = bindings().DB;
  const now = new Date().toISOString();
  const statements: D1PreparedStatementLite[] = [];
  const changedTaskIds: string[] = [];

  for (const [operationIndex, operation] of proposal.operations.entries()) {
    if (operation.type === "create") {
      const id = `${proposalId}:task:${operationIndex}`;
      const status = operation.status || "pending";
      const after: TaskRow = {
        id, owner_id: ownerId, title: operation.title, notes: operation.notes || null,
        scheduled_date: operation.scheduled_date, start_time: operation.start_time || "09:00",
        duration_minutes: operation.duration_minutes || 30, status, priority: operation.priority || 2,
        energy: operation.energy || "medium", area: operation.area || "سایر", recurring_rule: "none",
        created_by_ai: 1, completed_at: status === "done" ? now : null, created_at: now, updated_at: now,
      };
      statements.push(db.prepare(`INSERT INTO tasks
        (id,owner_id,title,notes,scheduled_date,start_time,duration_minutes,status,priority,energy,area,recurring_rule,created_by_ai,completed_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          after.id, after.owner_id, after.title, after.notes, after.scheduled_date, after.start_time,
          after.duration_minutes, after.status, after.priority, after.energy, after.area, after.recurring_rule,
          after.created_by_ai, after.completed_at, after.created_at, after.updated_at,
        ));
      statements.push(eventStatement(`${proposalId}:event:${operationIndex}`, ownerId, proposalId, operation.type, id, null, after, now));
      changedTaskIds.push(id);
      continue;
    }

    const before = await taskById(ownerId, operation.task_id);
    if (!before) throw new Error("TASK_NOT_FOUND");
    const after = operation.type === "delete"
      ? { ...before, status: "deleted", completed_at: null, updated_at: now }
      : mergeTask(before, operation, now);
    statements.push(db.prepare(`UPDATE tasks SET title=?,notes=?,scheduled_date=?,start_time=?,duration_minutes=?,
      status=?,priority=?,energy=?,area=?,recurring_rule=?,completed_at=?,updated_at=? WHERE id=? AND owner_id=?`).bind(
        after.title, after.notes, after.scheduled_date, after.start_time, after.duration_minutes, after.status,
        after.priority, after.energy, after.area, after.recurring_rule, after.completed_at, after.updated_at,
        after.id, ownerId,
      ));
    statements.push(eventStatement(`${proposalId}:event:${operationIndex}`, ownerId, proposalId, operation.type, before.id, before, after, now));
    changedTaskIds.push(before.id);
  }

  statements.push(db.prepare(`UPDATE agent_action_proposals SET status='applied',applied_at=?
    WHERE id=? AND owner_id=? AND status='pending'`).bind(now, proposalId, ownerId));
  await db.batch(statements);
  return { proposal: await getProposal(ownerId, proposalId), taskIds: changedTaskIds };
}

export async function undoProposal(ownerId: string, proposalId: string) {
  const proposal = await getProposal(ownerId, proposalId);
  if (!proposal) throw new Error("PROPOSAL_NOT_FOUND");
  if (proposal.status !== "applied") throw new Error("PROPOSAL_NOT_APPLIED");

  const events = await bindings().DB.prepare(`SELECT * FROM agent_action_events
    WHERE owner_id=? AND proposal_id=? ORDER BY created_at DESC`).bind(ownerId, proposalId).all<EventRow>();
  const db = bindings().DB;
  const statements: D1PreparedStatementLite[] = [];
  const now = new Date().toISOString();

  for (const event of events.results || []) {
    const before = parseTask(event.before_json);
    const after = parseTask(event.after_json);
    const current = await taskById(ownerId, event.task_id);
    if (!current || !after || current.updated_at !== after.updated_at) throw new Error("UNDO_CONFLICT");

    if (event.operation_type === "create") {
      statements.push(db.prepare("DELETE FROM tasks WHERE id=? AND owner_id=? AND updated_at=?")
        .bind(event.task_id, ownerId, after.updated_at));
    } else if (before) {
      statements.push(db.prepare(`UPDATE tasks SET title=?,notes=?,scheduled_date=?,start_time=?,duration_minutes=?,
        status=?,priority=?,energy=?,area=?,recurring_rule=?,created_by_ai=?,completed_at=?,created_at=?,updated_at=?
        WHERE id=? AND owner_id=? AND updated_at=?`).bind(
          before.title, before.notes, before.scheduled_date, before.start_time, before.duration_minutes,
          before.status, before.priority, before.energy, before.area, before.recurring_rule,
          before.created_by_ai, before.completed_at, before.created_at, now,
          event.task_id, ownerId, after.updated_at,
        ));
    }
  }

  statements.push(db.prepare(`UPDATE agent_action_proposals SET status='undone',undone_at=?
    WHERE id=? AND owner_id=? AND status='applied'`).bind(now, proposalId, ownerId));
  await db.batch(statements);
  return getProposal(ownerId, proposalId);
}

function eventStatement(id: string, ownerId: string, proposalId: string, type: TaskOperation["type"], taskId: string, before: TaskRow | null, after: TaskRow, now: string) {
  return bindings().DB.prepare(`INSERT INTO agent_action_events
    (id,owner_id,proposal_id,operation_type,task_id,before_json,after_json,created_at)
    VALUES (?,?,?,?,?,?,?,?)`).bind(
      id, ownerId, proposalId, type, taskId,
      before ? JSON.stringify(before) : null, JSON.stringify(after), now,
    );
}

async function verifyTargets(ownerId: string, operations: TaskOperation[]) {
  for (const operation of operations) {
    if (operation.type !== "create" && !(await taskById(ownerId, operation.task_id))) throw new Error("TASK_NOT_FOUND");
  }
}

async function taskById(ownerId: string, taskId: string) {
  return bindings().DB.prepare("SELECT * FROM tasks WHERE id=? AND owner_id=?")
    .bind(taskId, ownerId).first<TaskRow>();
}

function mergeTask(before: TaskRow, operation: UpdateTaskOperation, now: string): TaskRow {
  const status = operation.status ?? before.status;
  return {
    ...before,
    title: operation.title ?? before.title,
    notes: operation.notes === undefined ? before.notes : operation.notes,
    scheduled_date: operation.scheduled_date ?? before.scheduled_date,
    start_time: operation.start_time ?? before.start_time,
    duration_minutes: operation.duration_minutes ?? before.duration_minutes,
    status,
    priority: operation.priority ?? before.priority,
    energy: operation.energy ?? before.energy,
    area: operation.area ?? before.area,
    completed_at: status === "done" ? before.completed_at || now : null,
    updated_at: now,
  };
}

function mapProposal(row: ProposalRow): AgentProposal {
  return {
    id: row.id, summary: row.summary, operations: normalizeOperations(parseJson(row.operations_json)), status: row.status,
    created_at: row.created_at, expires_at: row.expires_at, applied_at: row.applied_at, undone_at: row.undone_at,
  };
}

function parseJson(value: string) {
  try { return JSON.parse(value) as unknown; } catch { return null; }
}

function parseTask(value: string | null) {
  const row = value ? parseJson(value) : null;
  return row && typeof row === "object" ? row as TaskRow : null;
}
