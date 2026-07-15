import { bindings, ensureDatabase, isoDateInTimezone } from "../../../lib/server";
import { scorePosition } from "../domain/match-score";
import { positionSources } from "../infrastructure/source-catalog";
import type { JourneySuggestion, MatchBreakdown, PositionRecord } from "../domain/types";

const defaultInterests = ["Medical Imaging", "Computer Vision", "Deep Learning", "Foundation Models", "Vision Transformer"];
const defaultSkills = ["Python", "PyTorch", "TensorFlow", "OpenCV", "Hugging Face", "Medical Image Analysis"];

const demoPositions = [
  {
    key: "sample-au-medical-ai",
    title: "PhD in trustworthy AI for medical imaging",
    university: "Australian university opportunity",
    professor: "Supervisor to verify",
    country: "Australia",
    city: "Melbourne",
    researchArea: "Medical Imaging · Deep Learning · Trustworthy AI",
    description: "Develop robust deep-learning methods for clinical imaging, uncertainty estimation and responsible translation into healthcare workflows.",
    funding: "funded",
    amount: "Competitive stipend",
    deadlineOffset: 24,
  },
  {
    key: "sample-eu-foundation-models",
    title: "Doctoral researcher in vision foundation models",
    university: "European research university opportunity",
    professor: "Research group listing",
    country: "Belgium",
    city: "Leuven",
    researchArea: "Foundation Models · Computer Vision · Multimodal Learning",
    description: "Study data-efficient adaptation of large vision and vision-language models for scientific and healthcare data.",
    funding: "funded",
    amount: "Salaried doctoral contract",
    deadlineOffset: 39,
  },
  {
    key: "sample-eu-robotics",
    title: "PhD position in embodied vision and robotics",
    university: "European technical university opportunity",
    professor: "Lab listing to review",
    country: "Netherlands",
    city: "Delft",
    researchArea: "Robotics · Vision Transformer · 3D Perception",
    description: "Explore 3D perception and transformer-based scene understanding for safe autonomous robots.",
    funding: "funded",
    amount: "University employment contract",
    deadlineOffset: 52,
  },
] as const;

let phdSchemaPromise: Promise<void> | null = null;

export async function ensurePhdDatabase(ownerId: string) {
  await ensureDatabase();
  if (!phdSchemaPromise) {
    const db = bindings().DB;
    phdSchemaPromise = db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS phd_profiles (
        owner_id TEXT PRIMARY KEY, headline TEXT NOT NULL DEFAULT 'Medical AI researcher',
        research_interests_json TEXT NOT NULL DEFAULT '[]', skills_json TEXT NOT NULL DEFAULT '[]',
        education_summary TEXT, target_countries_json TEXT NOT NULL DEFAULT '[]', english_goal TEXT,
        relocation_goal TEXT, updated_at TEXT NOT NULL)`),
      db.prepare(`CREATE TABLE IF NOT EXISTS phd_positions (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, source TEXT NOT NULL, source_key TEXT,
        title TEXT NOT NULL, university TEXT NOT NULL, professor TEXT, country TEXT NOT NULL, city TEXT,
        research_area TEXT NOT NULL, description TEXT, url TEXT, funding_status TEXT NOT NULL DEFAULT 'unknown',
        scholarship INTEGER NOT NULL DEFAULT 0, funding_amount TEXT, deadline TEXT, status TEXT NOT NULL DEFAULT 'discovered',
        is_demo INTEGER NOT NULL DEFAULT 0, discovered_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_phd_positions_owner_deadline ON phd_positions(owner_id, deadline)"),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_phd_positions_owner_source_key ON phd_positions(owner_id, source, source_key)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS position_matches (
        position_id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, research_score INTEGER NOT NULL,
        publication_score INTEGER NOT NULL, skill_score INTEGER NOT NULL, education_score INTEGER NOT NULL,
        overall_score INTEGER NOT NULL, explanation TEXT NOT NULL, strengths_json TEXT NOT NULL DEFAULT '[]',
        gaps_json TEXT NOT NULL DEFAULT '[]', scored_by TEXT NOT NULL DEFAULT 'deterministic-v1', updated_at TEXT NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_position_matches_owner_score ON position_matches(owner_id, overall_score)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS phd_applications (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, position_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'shortlisted',
        priority INTEGER NOT NULL DEFAULT 2, next_action TEXT, next_action_date TEXT, notes TEXT,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL)`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_phd_applications_owner_position ON phd_applications(owner_id, position_id)"),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_phd_applications_owner_status ON phd_applications(owner_id, status)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS phd_timeline_events (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, application_id TEXT, position_id TEXT,
        event_type TEXT NOT NULL, title TEXT NOT NULL, metadata_json TEXT NOT NULL DEFAULT '{}', occurred_at TEXT NOT NULL)`),
      db.prepare("CREATE INDEX IF NOT EXISTS idx_phd_timeline_owner_time ON phd_timeline_events(owner_id, occurred_at)"),
      db.prepare(`CREATE TABLE IF NOT EXISTS planner_links (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, task_id TEXT NOT NULL, entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL, action_type TEXT NOT NULL, created_at TEXT NOT NULL)`),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_planner_links_dedupe ON planner_links(owner_id, entity_type, entity_id, action_type)"),
      db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_planner_links_task ON planner_links(task_id)"),
    ]).then(() => undefined).catch((error) => { phdSchemaPromise = null; throw error; });
  }
  await phdSchemaPromise;
  await ensurePhdProfile(ownerId);
  await ensureDemoPositions(ownerId);
}

async function ensurePhdProfile(ownerId: string) {
  const now = new Date().toISOString();
  await bindings().DB.prepare(`INSERT OR IGNORE INTO phd_profiles
    (owner_id,headline,research_interests_json,skills_json,education_summary,target_countries_json,english_goal,relocation_goal,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?)`).bind(
      ownerId, "Medical AI & Computer Vision researcher", JSON.stringify(defaultInterests), JSON.stringify(defaultSkills),
      "M.Sc. background in Electrical and Computer Engineering", JSON.stringify(["Australia", "Germany", "Netherlands", "Belgium"]),
      "Confident academic speaking and IELTS/TOEFL readiness", "Relocate through a fully funded PhD pathway", now,
    ).run();
}

async function ensureDemoPositions(ownerId: string) {
  const db = bindings().DB;
  const count = await db.prepare("SELECT COUNT(*) AS count FROM phd_positions WHERE owner_id=?").bind(ownerId).first<{ count: number }>();
  if (count?.count) return;
  const now = new Date().toISOString();
  const today = isoDateInTimezone();
  const profile = { researchInterests: defaultInterests, skills: defaultSkills, educationSummary: "M.Sc. Electrical and Computer Engineering" };
  for (const item of demoPositions) {
    const id = crypto.randomUUID();
    const deadline = addDays(today, item.deadlineOffset);
    await db.prepare(`INSERT INTO phd_positions
      (id,owner_id,source,source_key,title,university,professor,country,city,research_area,description,url,funding_status,scholarship,funding_amount,deadline,status,is_demo,discovered_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        id, ownerId, "sample", item.key, item.title, item.university, item.professor, item.country, item.city,
        item.researchArea, item.description, null, item.funding, 1, item.amount, deadline, "discovered", 1, now, now,
      ).run();
    await saveMatch(ownerId, id, scorePosition(profile, item));
  }
}

async function saveMatch(ownerId: string, positionId: string, match: MatchBreakdown) {
  await bindings().DB.prepare(`INSERT OR REPLACE INTO position_matches
    (position_id,owner_id,research_score,publication_score,skill_score,education_score,overall_score,explanation,strengths_json,gaps_json,scored_by,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      positionId, ownerId, match.research, match.publications, match.skills, match.education, match.overall,
      match.explanation, JSON.stringify(match.strengths), JSON.stringify(match.gaps), "deterministic-v1", new Date().toISOString(),
    ).run();
}

export async function getPhdCommandCenter(ownerId: string) {
  await ensurePhdDatabase(ownerId);
  const db = bindings().DB;
  const [positionRows, applicationRows, plannerRows, profile] = await Promise.all([
    db.prepare(`SELECT p.*,m.research_score,m.publication_score,m.skill_score,m.education_score,m.overall_score,
      m.explanation,m.strengths_json,m.gaps_json,a.id AS application_id,a.status AS application_status
      FROM phd_positions p LEFT JOIN position_matches m ON m.position_id=p.id
      LEFT JOIN phd_applications a ON a.position_id=p.id AND a.owner_id=p.owner_id
      WHERE p.owner_id=? ORDER BY COALESCE(m.overall_score,0) DESC,p.deadline ASC`).bind(ownerId).all<Record<string, unknown>>(),
    db.prepare(`SELECT a.*,p.title,p.university,p.country,p.deadline,m.overall_score
      FROM phd_applications a JOIN phd_positions p ON p.id=a.position_id
      LEFT JOIN position_matches m ON m.position_id=p.id WHERE a.owner_id=? ORDER BY a.updated_at DESC`).bind(ownerId).all(),
    db.prepare(`SELECT t.*,l.entity_type,l.entity_id,l.action_type FROM planner_links l
      JOIN tasks t ON t.id=l.task_id WHERE l.owner_id=? AND t.status NOT IN ('deleted','cancelled')
      ORDER BY t.scheduled_date,t.start_time LIMIT 40`).bind(ownerId).all(),
    db.prepare("SELECT * FROM phd_profiles WHERE owner_id=?").bind(ownerId).first(),
  ]);

  const positions = (positionRows.results || []).map(toPositionRecord);
  const applications = applicationRows.results || [];
  const plannerTasks = plannerRows.results || [];
  const highestMatch = positions[0]?.match.overall || 0;
  return {
    profile,
    positions,
    applications,
    plannerTasks,
    sources: positionSources,
    suggestions: journeySuggestions(),
    metrics: {
      opportunities: positions.length,
      applications: applications.length,
      highestMatch,
      upcomingDeadlines: positions.filter((position) => position.deadline && position.deadline >= isoDateInTimezone()).length,
    },
  };
}

function toPositionRecord(row: Record<string, unknown>): PositionRecord {
  return {
    id: String(row.id), source: String(row.source), title: String(row.title), university: String(row.university),
    professor: nullable(row.professor), country: String(row.country), city: nullable(row.city), research_area: String(row.research_area),
    description: nullable(row.description), url: nullable(row.url), funding_status: String(row.funding_status),
    scholarship: Number(row.scholarship || 0), funding_amount: nullable(row.funding_amount), deadline: nullable(row.deadline),
    status: String(row.status), is_demo: Number(row.is_demo || 0), application_id: nullable(row.application_id),
    application_status: row.application_status ? String(row.application_status) as PositionRecord["application_status"] : null,
    match: {
      research: Number(row.research_score || 0), publications: Number(row.publication_score || 0),
      skills: Number(row.skill_score || 0), education: Number(row.education_score || 0), overall: Number(row.overall_score || 0),
      explanation: String(row.explanation || "Match analysis is waiting."), strengths: parseArray(row.strengths_json), gaps: parseArray(row.gaps_json),
    },
  };
}

export async function trackApplication(ownerId: string, positionId: string) {
  await ensurePhdDatabase(ownerId);
  const db = bindings().DB;
  const position = await db.prepare("SELECT title FROM phd_positions WHERE id=? AND owner_id=?").bind(positionId, ownerId).first<{ title: string }>();
  if (!position) throw new Error("POSITION_NOT_FOUND");
  const existingApplication = await db.prepare("SELECT * FROM phd_applications WHERE owner_id=? AND position_id=?")
    .bind(ownerId, positionId).first<Record<string, unknown>>();
  if (existingApplication) return existingApplication;
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await db.prepare(`INSERT OR IGNORE INTO phd_applications
    (id,owner_id,position_id,status,priority,next_action,next_action_date,notes,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`).bind(id, ownerId, positionId, "shortlisted", 1, "Review requirements and prepare supervisor note", addDays(isoDateInTimezone(), 2), null, now, now).run();
  const application = await db.prepare("SELECT * FROM phd_applications WHERE owner_id=? AND position_id=?").bind(ownerId, positionId).first<Record<string, unknown>>();
  await db.prepare(`INSERT INTO phd_timeline_events
    (id,owner_id,application_id,position_id,event_type,title,metadata_json,occurred_at) VALUES (?,?,?,?,?,?,?,?)`).bind(
      crypto.randomUUID(), ownerId, String(application?.id || id), positionId, "shortlisted", `Shortlisted: ${position.title}`, "{}", now,
    ).run();
  return application;
}

export async function addManualPosition(ownerId: string, input: {
  title: string; university: string; professor?: string; country: string; city?: string;
  researchArea: string; description?: string; url?: string; fundingStatus?: string;
  fundingAmount?: string; deadline?: string;
}) {
  await ensurePhdDatabase(ownerId);
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const item = { title: input.title, researchArea: input.researchArea, description: input.description || null };
  await bindings().DB.prepare(`INSERT INTO phd_positions
    (id,owner_id,source,source_key,title,university,professor,country,city,research_area,description,url,funding_status,scholarship,funding_amount,deadline,status,is_demo,discovered_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
      id, ownerId, "manual", id, input.title, input.university, input.professor || null, input.country,
      input.city || null, input.researchArea, input.description || null, input.url || null,
      input.fundingStatus || "unknown", input.fundingStatus === "funded" ? 1 : 0,
      input.fundingAmount || null, input.deadline || null, "discovered", 0, now, now,
    ).run();
  await saveMatch(ownerId, id, scorePosition({
    researchInterests: defaultInterests, skills: defaultSkills,
    educationSummary: "M.Sc. Electrical and Computer Engineering",
  }, item));
  return bindings().DB.prepare("SELECT * FROM phd_positions WHERE id=? AND owner_id=?").bind(id, ownerId).first();
}

export async function scheduleJourneyAction(ownerId: string, input: {
  entityType: string; entityId: string; actionType: string; title: string; notes?: string;
  scheduledDate: string; startTime: string; durationMinutes: number; area: string;
}) {
  await ensurePhdDatabase(ownerId);
  const db = bindings().DB;
  const existing = await db.prepare(`SELECT t.*,l.id AS planner_link_id FROM planner_links l JOIN tasks t ON t.id=l.task_id
    WHERE l.owner_id=? AND l.entity_type=? AND l.entity_id=? AND l.action_type=?`).bind(
      ownerId, input.entityType, input.entityId, input.actionType,
    ).first<Record<string, unknown>>();
  if (existing && !["deleted", "cancelled"].includes(String(existing.status))) return { task: existing, created: false };
  if (existing?.planner_link_id) {
    await db.prepare("DELETE FROM planner_links WHERE id=? AND owner_id=?").bind(String(existing.planner_link_id), ownerId).run();
  }
  const now = new Date().toISOString();
  const taskId = crypto.randomUUID();
  await db.batch([
    db.prepare(`INSERT INTO tasks
      (id,owner_id,title,notes,scheduled_date,start_time,duration_minutes,status,priority,energy,area,recurring_rule,created_by_ai,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        taskId, ownerId, input.title, input.notes || null, input.scheduledDate, input.startTime,
        Math.min(240, Math.max(10, input.durationMinutes)), "pending", 1, "high", input.area, "none", 1, now, now,
      ),
    db.prepare(`INSERT INTO planner_links
      (id,owner_id,task_id,entity_type,entity_id,action_type,created_at) VALUES (?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), ownerId, taskId, input.entityType, input.entityId, input.actionType, now,
      ),
  ]);
  const task = await db.prepare("SELECT * FROM tasks WHERE id=?").bind(taskId).first();
  return { task, created: true };
}

export async function loadPhdAgentContext(ownerId: string) {
  await ensurePhdDatabase(ownerId);
  const db = bindings().DB;
  const [positions, applications, profile] = await Promise.all([
    db.prepare(`SELECT p.title,p.university,p.country,p.professor,p.deadline,p.funding_status,m.overall_score
      FROM phd_positions p LEFT JOIN position_matches m ON m.position_id=p.id WHERE p.owner_id=?
      ORDER BY COALESCE(m.overall_score,0) DESC LIMIT 12`).bind(ownerId).all(),
    db.prepare(`SELECT a.status,a.next_action,a.next_action_date,p.title,p.university
      FROM phd_applications a JOIN phd_positions p ON p.id=a.position_id WHERE a.owner_id=? LIMIT 30`).bind(ownerId).all(),
    db.prepare("SELECT headline,research_interests_json,skills_json,english_goal,relocation_goal FROM phd_profiles WHERE owner_id=?").bind(ownerId).first(),
  ]);
  return `PhD candidate profile: ${JSON.stringify(profile || {})}\nTop positions: ${JSON.stringify(positions.results || [])}\nApplications: ${JSON.stringify(applications.results || [])}`;
}

function journeySuggestions(): JourneySuggestion[] {
  const today = isoDateInTimezone();
  return [
    { id: "weekly-literature", title: "Read and annotate one recent medical-AI paper", description: "Capture the research gap and two questions for a potential supervisor.", area: "Research", durationMinutes: 50, suggestedDate: addDays(today, 1), suggestedTime: "09:30" },
    { id: "english-pitch", title: "Practice your 90-second research pitch in English", description: "Record once, improve clarity, then repeat without notes.", area: "English", durationMinutes: 25, suggestedDate: addDays(today, 1), suggestedTime: "18:00" },
    { id: "cv-proof", title: "Strengthen one CV achievement with evidence", description: "Add a measurable result, method and research impact.", area: "Documents", durationMinutes: 30, suggestedDate: addDays(today, 2), suggestedTime: "17:00" },
    { id: "relocation-map", title: "Compare one target country's PhD-to-visa path", description: "Save funding, dependent and post-study work requirements.", area: "Relocation", durationMinutes: 35, suggestedDate: addDays(today, 3), suggestedTime: "19:00" },
  ];
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function nullable(value: unknown) { return value == null || value === "" ? null : String(value); }
function parseArray(value: unknown): string[] { try { const parsed = JSON.parse(String(value || "[]")); return Array.isArray(parsed) ? parsed.map(String) : []; } catch { return []; } }
