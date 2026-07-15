import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  passwordIterations: integer("password_iterations").notNull().default(100000),
  isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
});

export const profiles = sqliteTable("profiles", {
  ownerId: text("owner_id").primaryKey(),
  displayName: text("display_name").notNull().default("دوست من"),
  timezone: text("timezone").notNull().default("Asia/Tehran"),
  dayStart: text("day_start").notNull().default("08:00"),
  dayEnd: text("day_end").notNull().default("22:00"),
  planningStyle: text("planning_style").notNull().default("balanced"),
  updatedAt: text("updated_at").notNull(),
});

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  scheduledDate: text("scheduled_date").notNull(),
  startTime: text("start_time").notNull().default("09:00"),
  durationMinutes: integer("duration_minutes").notNull().default(30),
  status: text("status").notNull().default("pending"),
  priority: integer("priority").notNull().default(2),
  energy: text("energy").notNull().default("medium"),
  area: text("area").notNull().default("سایر"),
  recurringRule: text("recurring_rule").notNull().default("none"),
  createdByAi: integer("created_by_ai", { mode: "boolean" }).notNull().default(false),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const credentials = sqliteTable("credentials", {
  ownerId: text("owner_id").primaryKey(),
  openrouterKeyCipher: text("openrouter_key_cipher"),
  openrouterKeyHint: text("openrouter_key_hint"),
  openrouterModel: text("openrouter_model").notNull().default("openrouter/free"),
  telegramTokenCipher: text("telegram_token_cipher"),
  telegramBotName: text("telegram_bot_name"),
  telegramChatId: text("telegram_chat_id"),
  telegramWebhookSecret: text("telegram_webhook_secret"),
  telegramWebhookStatus: text("telegram_webhook_status").notNull().default("disconnected"),
  updatedAt: text("updated_at").notNull(),
});

export const agentMessages = sqliteTable("agent_messages", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  createdAt: text("created_at").notNull(),
});

export const agentActionProposals = sqliteTable("agent_action_proposals", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  summary: text("summary").notNull(),
  operationsJson: text("operations_json").notNull(),
  status: text("status").notNull().default("pending"),
  createdAt: text("created_at").notNull(),
  expiresAt: text("expires_at").notNull(),
  appliedAt: text("applied_at"),
  undoneAt: text("undone_at"),
});

export const agentActionEvents = sqliteTable("agent_action_events", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  proposalId: text("proposal_id").notNull(),
  operationType: text("operation_type").notNull(),
  taskId: text("task_id").notNull(),
  beforeJson: text("before_json"),
  afterJson: text("after_json"),
  createdAt: text("created_at").notNull(),
});

export const authAttempts = sqliteTable("auth_attempts", {
  id: text("id").primaryKey(),
  identityHash: text("identity_hash").notNull(),
  ipHash: text("ip_hash").notNull(),
  action: text("action").notNull(),
  success: integer("success", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull(),
});
