import { bindings, ensureDatabase } from "../../../lib/server";

export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    await ensureDatabase();
    const schema = await bindings().DB.prepare(`SELECT
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='users') AS users_table,
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='sessions') AS sessions_table,
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='tasks') AS tasks_table,
      (SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='auth_attempts') AS auth_attempts_table`).first<Record<string, number>>();
    const ready = Boolean(schema?.users_table && schema?.sessions_table && schema?.tasks_table && schema?.auth_attempts_table);
    return Response.json({
      ok: ready,
      service: "roozbani-os",
      database: ready ? "ready" : "schema-incomplete",
      checked_at: checkedAt,
    }, { status: ready ? 200 : 503, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const value = error instanceof Error ? error.message : "Unknown database error";
    const missingBinding = value.toLowerCase().includes("d1 binding is not available");
    console.error("Health check failed", { message: value });
    return Response.json({
      ok: false,
      service: "roozbani-os",
      database: missingBinding ? "binding-missing" : "unavailable",
      code: missingBinding ? "DB_BINDING_MISSING" : "DB_UNAVAILABLE",
      checked_at: checkedAt,
    }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
