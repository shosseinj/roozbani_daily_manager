export const taskStatuses = ["pending", "in_progress", "done", "cancelled"] as const;
export const taskEnergies = ["high", "medium", "low"] as const;

export type TaskStatus = (typeof taskStatuses)[number];
export type TaskEnergy = (typeof taskEnergies)[number];

export type CreateTaskOperation = {
  type: "create";
  title: string;
  notes?: string | null;
  scheduled_date: string;
  start_time?: string;
  duration_minutes?: number;
  status?: TaskStatus;
  priority?: number;
  energy?: TaskEnergy;
  area?: string;
};

export type UpdateTaskOperation = {
  type: "update";
  task_id: string;
  title?: string;
  notes?: string | null;
  scheduled_date?: string;
  start_time?: string;
  duration_minutes?: number;
  status?: TaskStatus;
  priority?: number;
  energy?: TaskEnergy;
  area?: string;
};

export type DeleteTaskOperation = {
  type: "delete";
  task_id: string;
};

export type TaskOperation = CreateTaskOperation | UpdateTaskOperation | DeleteTaskOperation;

export type AgentProposal = {
  id: string;
  summary: string;
  operations: TaskOperation[];
  status: "pending" | "applied" | "rejected" | "undone" | "expired";
  created_at: string;
  expires_at: string;
  applied_at?: string | null;
  undone_at?: string | null;
};

export type AgentMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
  proposal_id?: string | null;
};

export function normalizeOperations(value: unknown): TaskOperation[] {
  if (!Array.isArray(value)) return [];
  const operations: TaskOperation[] = [];

  for (const item of value.slice(0, 12)) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const type = String(row.type || "");

    if (type === "create") {
      const title = cleanText(row.title, 180);
      const scheduledDate = cleanDate(row.scheduled_date);
      if (!title || !scheduledDate) continue;
      operations.push({
        type,
        title,
        scheduled_date: scheduledDate,
        notes: cleanNullableText(row.notes, 1200),
        start_time: cleanTime(row.start_time) || "09:00",
        duration_minutes: boundedInteger(row.duration_minutes, 5, 720, 30),
        status: cleanStatus(row.status),
        priority: boundedInteger(row.priority, 1, 3, 2),
        energy: cleanEnergy(row.energy),
        area: cleanText(row.area, 50) || "سایر",
      });
      continue;
    }

    if (type === "update") {
      const taskId = cleanText(row.task_id, 80);
      if (!taskId) continue;
      const operation: UpdateTaskOperation = { type, task_id: taskId };
      if ("title" in row) operation.title = cleanText(row.title, 180);
      if ("notes" in row) operation.notes = cleanNullableText(row.notes, 1200);
      if ("scheduled_date" in row) operation.scheduled_date = cleanDate(row.scheduled_date) || undefined;
      if ("start_time" in row) operation.start_time = cleanTime(row.start_time) || undefined;
      if ("duration_minutes" in row) operation.duration_minutes = boundedInteger(row.duration_minutes, 5, 720, 30);
      if ("status" in row) operation.status = cleanStatus(row.status);
      if ("priority" in row) operation.priority = boundedInteger(row.priority, 1, 3, 2);
      if ("energy" in row) operation.energy = cleanEnergy(row.energy);
      if ("area" in row) operation.area = cleanText(row.area, 50);
      if (Object.keys(operation).length > 2) operations.push(operation);
      continue;
    }

    if (type === "delete") {
      const taskId = cleanText(row.task_id, 80);
      if (taskId) operations.push({ type, task_id: taskId });
    }
  }

  return operations;
}

function cleanText(value: unknown, max: number) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanNullableText(value: unknown, max: number) {
  const text = cleanText(value, max);
  return text || null;
}

function cleanDate(value: unknown) {
  const text = String(value ?? "");
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function cleanTime(value: unknown) {
  const text = String(value ?? "");
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(text) ? text : "";
}

function boundedInteger(value: unknown, min: number, max: number, fallback: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function cleanStatus(value: unknown): TaskStatus {
  const status = String(value ?? "pending") as TaskStatus;
  return taskStatuses.includes(status) ? status : "pending";
}

function cleanEnergy(value: unknown): TaskEnergy {
  const energy = String(value ?? "medium") as TaskEnergy;
  return taskEnergies.includes(energy) ? energy : "medium";
}
