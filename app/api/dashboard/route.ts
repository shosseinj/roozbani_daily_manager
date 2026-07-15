import {
  bindings,
  ensureOwner,
  userFromRequest,
} from "../../../lib/server";

function message(error: unknown) {
  return error instanceof Error ? error.message : "خطای نامشخص";
}

export async function GET(request: Request) {
  try {
    const user = await userFromRequest(request);

    if (!user) {
      return Response.json(
        { ok: false, error: "UNAUTHORIZED" },
        { status: 401 },
      );
    }

    await ensureOwner(user.id, user.display_name);

    const db = bindings().DB;
    const [tasks, profile, credentials] = await Promise.all([
      db
        .prepare(`
          SELECT *
          FROM tasks
          WHERE owner_id = ? AND status != 'deleted'
          ORDER BY scheduled_date ASC, start_time ASC
          LIMIT 500
        `)
        .bind(user.id)
        .all(),
      db
        .prepare("SELECT * FROM profiles WHERE owner_id = ?")
        .bind(user.id)
        .first(),
      db
        .prepare(`
          SELECT
            openrouter_key_hint,
            openrouter_model,
            telegram_bot_name,
            telegram_chat_id,
            telegram_webhook_status
          FROM credentials
          WHERE owner_id = ?
        `)
        .bind(user.id)
        .first(),
    ]);

    return Response.json({
      ok: true,
      user,
      tasks: tasks.results || [],
      profile,
      integrations: credentials,
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: message(error) },
      { status: 500 },
    );
  }
}
