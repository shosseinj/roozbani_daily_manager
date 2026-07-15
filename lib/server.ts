type Bindings = {
  DB: D1DatabaseLite;
  CREDENTIAL_ENCRYPTION_KEY?: string;
  OPENROUTER_API_KEY?: string;
  APP_NAME?: string;
};

export type D1PreparedStatementLite = {
  bind(...values: unknown[]): D1PreparedStatementLite;
  run<T = unknown>(): Promise<T>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
};

export type D1DatabaseLite = {
  prepare(query: string): D1PreparedStatementLite;
  batch<T = unknown>(statements: D1PreparedStatementLite[]): Promise<T[]>;
};

export type TaskRow = {
  id: string;
  owner_id: string;
  title: string;
  notes: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  priority: number;
  energy: string;
  area: string;
  recurring_rule: string;
  created_by_ai: number;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AuthenticatedUser = {
  id: string;
  username: string;
  display_name: string;
  is_active: number;
};

type UserRow = AuthenticatedUser & {
  password_hash: string;
  password_salt: string;
  password_iterations: number;
};

declare global {
  // The Worker entry publishes request-scoped bindings before the app router runs.
  // Cloudflare supplies the same immutable binding object for every request.
  var __ROOZBANI_ENV__: Bindings | undefined;
}

export const bindings = () => {
  const environment = globalThis.__ROOZBANI_ENV__;

  if (!environment?.DB) {
    throw new Error("D1 binding is not available");
  }

  return environment;
};

let schemaPromise: Promise<void> | null = null;

export async function ensureDatabase() {
  if (schemaPromise) {
    return schemaPromise;
  }

  const db = bindings().DB;

  schemaPromise = (async () => {
    await db.batch([
      db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY NOT NULL,
          username TEXT NOT NULL UNIQUE,
          display_name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          password_iterations INTEGER NOT NULL DEFAULT 100000,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `),

      db.prepare(`
        CREATE TABLE IF NOT EXISTS sessions (
          id TEXT PRIMARY KEY NOT NULL,
          user_id TEXT NOT NULL,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TEXT NOT NULL,
          created_at TEXT NOT NULL,
          last_seen_at TEXT NOT NULL,
          FOREIGN KEY (user_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
      `),

      db.prepare(`
        CREATE TABLE IF NOT EXISTS profiles (
          owner_id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL DEFAULT 'دوست من',
          timezone TEXT NOT NULL DEFAULT 'Asia/Tehran',
          day_start TEXT NOT NULL DEFAULT '08:00',
          day_end TEXT NOT NULL DEFAULT '22:00',
          planning_style TEXT NOT NULL DEFAULT 'balanced',
          updated_at TEXT NOT NULL,
          FOREIGN KEY (owner_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
      `),

      db.prepare(`
        CREATE TABLE IF NOT EXISTS tasks (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          title TEXT NOT NULL,
          notes TEXT,
          scheduled_date TEXT NOT NULL,
          start_time TEXT NOT NULL DEFAULT '09:00',
          duration_minutes INTEGER NOT NULL DEFAULT 30,
          status TEXT NOT NULL DEFAULT 'pending',
          priority INTEGER NOT NULL DEFAULT 2,
          energy TEXT NOT NULL DEFAULT 'medium',
          area TEXT NOT NULL DEFAULT 'سایر',
          recurring_rule TEXT NOT NULL DEFAULT 'none',
          created_by_ai INTEGER NOT NULL DEFAULT 0,
          completed_at TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (owner_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
      `),

      db.prepare(`
        CREATE TABLE IF NOT EXISTS credentials (
          owner_id TEXT PRIMARY KEY,
          openrouter_key_cipher TEXT,
          openrouter_key_hint TEXT,
          openrouter_model TEXT NOT NULL DEFAULT 'openrouter/auto',
          telegram_token_cipher TEXT,
          telegram_bot_name TEXT,
          telegram_chat_id TEXT,
          telegram_webhook_secret TEXT UNIQUE,
          telegram_webhook_status TEXT NOT NULL DEFAULT 'disconnected',
          updated_at TEXT NOT NULL,
          FOREIGN KEY (owner_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
      `),

      db.prepare(`
        CREATE TABLE IF NOT EXISTS agent_messages (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          created_at TEXT NOT NULL,
          FOREIGN KEY (owner_id)
            REFERENCES users(id)
            ON DELETE CASCADE
        )
      `),

      db.prepare(`
        CREATE TABLE IF NOT EXISTS agent_action_proposals (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          summary TEXT NOT NULL,
          operations_json TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'pending',
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL,
          applied_at TEXT,
          undone_at TEXT,
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `),

      db.prepare(`
        CREATE TABLE IF NOT EXISTS agent_action_events (
          id TEXT PRIMARY KEY,
          owner_id TEXT NOT NULL,
          proposal_id TEXT NOT NULL,
          operation_type TEXT NOT NULL,
          task_id TEXT NOT NULL,
          before_json TEXT,
          after_json TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (proposal_id) REFERENCES agent_action_proposals(id) ON DELETE CASCADE
        )
      `),

      db.prepare(`
        CREATE TABLE IF NOT EXISTS auth_attempts (
          id TEXT PRIMARY KEY,
          identity_hash TEXT NOT NULL,
          ip_hash TEXT NOT NULL,
          action TEXT NOT NULL,
          success INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL
        )
      `),
    ]);

    await db.batch([
      db.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username
        ON users(username)
      `),

      db.prepare(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_token
        ON sessions(token_hash)
      `),

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_sessions_user
        ON sessions(user_id)
      `),

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_sessions_expiry
        ON sessions(expires_at)
      `),

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_tasks_owner_date
        ON tasks(owner_id, scheduled_date)
      `),

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_tasks_owner_status
        ON tasks(owner_id, status)
      `),

      db.prepare(`
        CREATE INDEX IF NOT EXISTS idx_agent_messages_owner_created
        ON agent_messages(owner_id, created_at)
      `),

      db.prepare(`CREATE INDEX IF NOT EXISTS idx_agent_proposals_owner_created
        ON agent_action_proposals(owner_id, created_at)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_agent_events_proposal
        ON agent_action_events(owner_id, proposal_id, created_at)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_attempts_identity_time
        ON auth_attempts(identity_hash, created_at)`),
      db.prepare(`CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_time
        ON auth_attempts(ip_hash, created_at)`),
    ]);
  })().catch((error) => {
    schemaPromise = null;
    throw error;
  });

  return schemaPromise;
}

const PRODUCTION_SESSION_COOKIE = "__Host-roozbani_session";
const DEVELOPMENT_SESSION_COOKIE = "roozbani_session";
export const PASSWORD_ITERATIONS = 100_000;
const SESSION_SECONDS = 60 * 60 * 24 * 30;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");

  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);

  const binary = atob(padded);

  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function randomToken(length = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(length)));
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return bytesToBase64Url(new Uint8Array(digest));
}

async function derivePasswordHash(password: string, salt: Uint8Array, iterations: number) {
  const passwordKey = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);

  const saltBytes = new Uint8Array(salt.byteLength);
  saltBytes.set(salt);

  const result = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: saltBytes,
      iterations,
    },
    passwordKey,
    256,
  );

  return new Uint8Array(result);
}

function timingSafeBytesEqual(left: Uint8Array, right: Uint8Array) {
  const comparisonLength = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;

  for (let index = 0; index < comparisonLength; index += 1) {
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  }

  return difference === 0;
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));

  const hash = await derivePasswordHash(password, salt, PASSWORD_ITERATIONS);

  return {
    hash: bytesToBase64Url(hash),
    salt: bytesToBase64Url(salt),
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(password: string, storedHash: string, storedSalt: string, iterations: number) {
  try {
    const actualHash = await derivePasswordHash(password, base64UrlToBytes(storedSalt), iterations);

    const expectedHash = base64UrlToBytes(storedHash);

    return timingSafeBytesEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

export async function upgradePasswordHash(userId: string, password: string, currentIterations: number) {
  if (currentIterations >= PASSWORD_ITERATIONS) return;
  const passwordData = await hashPassword(password);
  await bindings().DB.prepare(`UPDATE users SET password_hash=?,password_salt=?,password_iterations=?,updated_at=? WHERE id=?`)
    .bind(passwordData.hash, passwordData.salt, passwordData.iterations, new Date().toISOString(), userId).run();
}

export function assertSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return;
  if (origin !== new URL(request.url).origin) throw new Error("INVALID_ORIGIN");
}

async function opaqueHash(value: string) {
  return sha256Base64Url(`roozbani:${value}`);
}

export async function checkAuthRateLimit(request: Request, identity: string) {
  await ensureDatabase();
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const identityHash = await opaqueHash(identity.toLowerCase());
  const ipHash = await opaqueHash(request.headers.get("cf-connecting-ip") || "local");
  const [byIdentity, byIp] = await Promise.all([
    bindings().DB.prepare(`SELECT COUNT(*) AS count FROM auth_attempts
      WHERE identity_hash=? AND success=0 AND created_at>=?`).bind(identityHash, since).first<{ count: number }>(),
    bindings().DB.prepare(`SELECT COUNT(*) AS count FROM auth_attempts
      WHERE ip_hash=? AND success=0 AND created_at>=?`).bind(ipHash, since).first<{ count: number }>(),
  ]);
  if (Number(byIdentity?.count || 0) >= 8 || Number(byIp?.count || 0) >= 30) throw new Error("AUTH_RATE_LIMITED");
  return { identityHash, ipHash };
}

export async function recordAuthAttempt(keys: { identityHash: string; ipHash: string }, action: string, success: boolean) {
  try {
    const now = new Date().toISOString();
    await bindings().DB.prepare(`INSERT INTO auth_attempts
      (id,identity_hash,ip_hash,action,success,created_at) VALUES (?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), keys.identityHash, keys.ipHash, action.slice(0, 20), success ? 1 : 0, now,
      ).run();
    if (Math.random() < 0.03) {
      await bindings().DB.prepare("DELETE FROM auth_attempts WHERE created_at<?")
        .bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).run();
    }
  } catch (error) {
    console.error("Auth attempt telemetry failed", error);
  }
}

function isSecureRequest(request: Request) {
  return new URL(request.url).protocol === "https:";
}

function sessionCookieName(request: Request) {
  return isSecureRequest(request) ? PRODUCTION_SESSION_COOKIE : DEVELOPMENT_SESSION_COOKIE;
}

function readCookie(request: Request, name: string) {
  const cookieHeader = request.headers.get("cookie") || "";

  for (const item of cookieHeader.split(";")) {
    const [cookieName, ...parts] = item.trim().split("=");

    if (cookieName === name) {
      try {
        return decodeURIComponent(parts.join("="));
      } catch {
        return "";
      }
    }
  }

  return "";
}

function readSessionToken(request: Request) {
  return readCookie(request, PRODUCTION_SESSION_COOKIE) || readCookie(request, DEVELOPMENT_SESSION_COOKIE);
}

export function sessionCookie(request: Request, token: string) {
  const parts = [`${sessionCookieName(request)}=${encodeURIComponent(token)}`, "Path=/", "HttpOnly", "SameSite=Strict", `Max-Age=${SESSION_SECONDS}`];

  if (isSecureRequest(request)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export function clearSessionCookie(request: Request) {
  const parts = [`${sessionCookieName(request)}=`, "Path=/", "HttpOnly", "SameSite=Strict", "Max-Age=0"];

  if (isSecureRequest(request)) {
    parts.push("Secure");
  }

  return parts.join("; ");
}

export async function createSession(userId: string) {
  await ensureDatabase();

  const db = bindings().DB;
  const token = randomToken();
  const tokenHash = await sha256Base64Url(token);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();

  await db
    .prepare(
      `
      INSERT INTO sessions (
        id,
        user_id,
        token_hash,
        expires_at,
        created_at,
        last_seen_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(crypto.randomUUID(), userId, tokenHash, expiresAt, nowIso, nowIso)
    .run();

  // Opportunistic cleanup. It is intentionally not awaited as a separate job.
  await db.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(nowIso).run();

  return token;
}

export async function createAccountWithSession(input: {
  userId: string;
  username: string;
  displayName: string;
  passwordHash: string;
  passwordSalt: string;
  passwordIterations: number;
}) {
  await ensureDatabase();
  const db = bindings().DB;
  const token = randomToken();
  const tokenHash = await sha256Base64Url(token);
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + SESSION_SECONDS * 1000).toISOString();
  const today = isoDateInTimezone(now);
  const samples = [
    ["سه کار مهم امروز را مشخص کن", "08:30", 20, 1, "برنامه‌ریزی", "high"],
    ["۹۰ دقیقه کار عمیق روی مهم‌ترین پروژه", "10:00", 90, 1, "کار", "high"],
    ["پیاده‌روی و استراحت بدون موبایل", "17:30", 30, 3, "سلامتی", "low"],
  ] as const;

  const statements: D1PreparedStatementLite[] = [
    db.prepare(`INSERT INTO users
      (id,username,display_name,password_hash,password_salt,password_iterations,is_active,created_at,updated_at)
      VALUES (?,?,?,?,?,?,1,?,?)`).bind(
        input.userId, input.username, input.displayName, input.passwordHash, input.passwordSalt,
        input.passwordIterations, nowIso, nowIso,
      ),
    db.prepare(`INSERT INTO profiles
      (owner_id,display_name,timezone,day_start,day_end,planning_style,updated_at)
      VALUES (?,?,?,?,?,?,?)`).bind(
        input.userId, input.displayName, "Asia/Tehran", "08:00", "22:00", "balanced", nowIso,
      ),
    db.prepare(`INSERT INTO credentials
      (owner_id,openrouter_model,telegram_webhook_status,updated_at) VALUES (?,?,?,?)`).bind(
        input.userId, "openrouter/free", "disconnected", nowIso,
      ),
    db.prepare(`INSERT INTO sessions
      (id,user_id,token_hash,expires_at,created_at,last_seen_at) VALUES (?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), input.userId, tokenHash, expiresAt, nowIso, nowIso,
      ),
  ];

  for (const [title, time, duration, priority, area, energy] of samples) {
    statements.push(db.prepare(`INSERT INTO tasks
      (id,owner_id,title,notes,scheduled_date,start_time,duration_minutes,status,priority,energy,area,recurring_rule,created_by_ai,completed_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
        crypto.randomUUID(), input.userId, title, "نمونه شروع — می‌توانی ویرایش یا حذفش کنی.", today,
        time, duration, "pending", priority, energy, area, "none", 0, null, nowIso, nowIso,
      ));
  }

  await db.batch(statements);
  return token;
}

export async function deleteSession(request: Request) {
  await ensureDatabase();

  const token = readSessionToken(request);

  if (!token) {
    return;
  }

  const tokenHash = await sha256Base64Url(token);

  await bindings().DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(tokenHash).run();
}

export async function userFromRequest(request: Request): Promise<AuthenticatedUser | null> {
  await ensureDatabase();

  const token = readSessionToken(request);

  if (!token) {
    return null;
  }

  const tokenHash = await sha256Base64Url(token);
  const now = new Date().toISOString();

  const user = await bindings()
    .DB.prepare(
      `
      SELECT
        u.id,
        u.username,
        u.display_name,
        u.is_active,
        s.last_seen_at
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE
        s.token_hash = ?
        AND s.expires_at > ?
        AND u.is_active = 1
      LIMIT 1
    `,
    )
    .bind(tokenHash, now)
    .first<AuthenticatedUser & { last_seen_at: string }>();

  if (!user) {
    return null;
  }

  if (user.last_seen_at < new Date(Date.now() - 60 * 60 * 1000).toISOString()) {
    await bindings().DB.prepare(`UPDATE sessions SET last_seen_at=? WHERE token_hash=?`).bind(now, tokenHash).run();
  }

  return { id: user.id, username: user.username, display_name: user.display_name, is_active: user.is_active };
}

export async function ownerIdFromRequest(request: Request) {
  const user = await userFromRequest(request);

  if (!user) {
    throw new Error("UNAUTHORIZED");
  }

  return user.id;
}

export async function findUserByUsername(username: string) {
  await ensureDatabase();

  return bindings()
    .DB.prepare(
      `
      SELECT
        id,
        username,
        display_name,
        password_hash,
        password_salt,
        password_iterations,
        is_active
      FROM users
      WHERE username = ?
      LIMIT 1
    `,
    )
    .bind(username)
    .first<UserRow>();
}

export function isoDateInTimezone(date = new Date(), timezone = "Asia/Tehran") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const read = (type: string) => parts.find((part) => part.type === type)?.value || "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}

export async function ensureOwner(ownerId: string, displayName = "دوست من") {
  await ensureDatabase();

  const now = new Date().toISOString();
  const db = bindings().DB;

  await db
    .prepare(
      `
      INSERT OR IGNORE INTO profiles (
        owner_id,
        display_name,
        timezone,
        day_start,
        day_end,
        planning_style,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `,
    )
    .bind(ownerId, displayName, "Asia/Tehran", "08:00", "22:00", "balanced", now)
    .run();

  await db
    .prepare(
      `
      INSERT OR IGNORE INTO credentials (
        owner_id,
        openrouter_model,
        telegram_webhook_status,
        updated_at
      )
      VALUES (?, ?, ?, ?)
    `,
    )
    .bind(ownerId, "openrouter/free", "disconnected", now)
    .run();

  const count = await db.prepare("SELECT COUNT(*) AS count FROM tasks WHERE owner_id = ?").bind(ownerId).first<{ count: number }>();

  if (Number(count?.count || 0) > 0) {
    return;
  }

  const today = isoDateInTimezone();
  const samples = [
    ["سه کار مهم امروز را مشخص کن", "08:30", 20, 1, "برنامه‌ریزی", "high"],
    ["۹۰ دقیقه کار عمیق روی مهم‌ترین پروژه", "10:00", 90, 1, "کار", "high"],
    ["پیاده‌روی و استراحت بدون موبایل", "17:30", 30, 3, "سلامتی", "low"],
  ] as const;

  for (const [title, time, duration, priority, area, energy] of samples) {
    await db
      .prepare(
        `
        INSERT INTO tasks (
          id,
          owner_id,
          title,
          notes,
          scheduled_date,
          start_time,
          duration_minutes,
          status,
          priority,
          energy,
          area,
          recurring_rule,
          created_by_ai,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      )
      .bind(crypto.randomUUID(), ownerId, title, "نمونه شروع — می‌توانی ویرایش یا حذفش کنی.", today, time, duration, "pending", priority, energy, area, "none", 0, now, now)
      .run();
  }
}

function bytesToBase64(bytes: Uint8Array) {
  let raw = "";

  for (const byte of bytes) {
    raw += String.fromCharCode(byte);
  }

  return btoa(raw);
}

function base64ToBytes(value: string) {
  const raw = atob(value);

  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = bindings().CREDENTIAL_ENCRYPTION_KEY;
  if (!secret || secret.length < 24) throw new Error("CREDENTIAL_ENCRYPTION_KEY_NOT_CONFIGURED");

  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));

  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptSecret(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const cipher = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    await encryptionKey(),
    new TextEncoder().encode(value),
  );

  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(cipher))}`;
}

export async function decryptSecret(value: string) {
  const [ivPart, cipherPart] = value.split(".");

  if (!ivPart || !cipherPart) {
    throw new Error("credential_format_invalid");
  }

  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: base64ToBytes(ivPart),
    },
    await encryptionKey(),
    base64ToBytes(cipherPart),
  );

  return new TextDecoder().decode(plain);
}

export async function openRouter(ownerId: string, messages: Array<{ role: string; content: string }>, model?: string) {
  await ensureDatabase();

  const row = await bindings()
    .DB.prepare(
      `
      SELECT
        openrouter_key_cipher,
        openrouter_model
      FROM credentials
      WHERE owner_id = ?
    `,
    )
    .bind(ownerId)
    .first<{
      openrouter_key_cipher: string | null;
      openrouter_model: string | null;
    }>();

  const key = row?.openrouter_key_cipher ? await decryptSecret(row.openrouter_key_cipher) : bindings().OPENROUTER_API_KEY;

  if (!key) {
    throw new Error("OPENROUTER_NOT_CONNECTED");
  }

  const selectedModel = model || row?.openrouter_model || "openrouter/free";

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${key}`,
      "X-OpenRouter-Title": "Roozbani Research & PhD OS",
    },
    body: JSON.stringify({
      model: selectedModel,
      messages,
      temperature: 0.28,
      max_tokens: 1300,
    }),
  });

  const data = (await response.json().catch(() => ({}))) as {
    choices?: Array<{
      message?: {
        content?: string;
      };
    }>;
    error?: {
      message?: string;
      metadata?: unknown;
    };
  };

  const text = data.choices?.[0]?.message?.content?.trim();

  if (!response.ok || !text) {
    throw new Error(data.error?.message || `OpenRouter ${response.status}`);
  }

  return {
    text,
    model: selectedModel,
  };
}

export async function telegramRequest(token: string, method: string, body: Record<string, unknown>) {
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = (await response.json().catch(() => ({}))) as {
    ok?: boolean;
    description?: string;
    result?: unknown;
  };

  if (!response.ok || !data.ok) {
    throw new Error(data.description || "Telegram request failed");
  }

  return data.result;
}

export function parseJsonObject(text: string) {
  const cleaned = text
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");

  if (start < 0 || end < start) {
    throw new Error("AI_JSON_INVALID");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
}
