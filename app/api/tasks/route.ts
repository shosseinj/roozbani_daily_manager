import {
  assertSameOrigin,
  bindings,
  ensureOwner,
  ownerIdFromRequest,
} from "../../../lib/server";

function message(error: unknown) {
  return error instanceof Error ? error.message : "خطای نامشخص";
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await ownerIdFromRequest(request);
    await ensureOwner(ownerId);

    const body = (await request.json()) as Record<string, unknown>;
    const title = String(body.title || "").trim();
    const date = String(body.scheduled_date || "");
    const time = String(body.start_time || "09:00");

    if (
      !title ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !/^\d{2}:\d{2}$/.test(time)
    ) {
      return Response.json(
        { ok: false, error: "عنوان، تاریخ و ساعت معتبر لازم است." },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const requestedStatus = String(body.status || "pending");
    const status = ["pending", "in_progress", "done", "cancelled"].includes(requestedStatus)
      ? requestedStatus
      : "pending";
    const completedAt = status === "done" ? now : null;

    await bindings()
      .DB.prepare(`
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
          completed_at,
          created_at,
          updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        id,
        ownerId,
        title,
        String(body.notes || "") || null,
        date,
        time,
        Math.min(720, Math.max(5, Number(body.duration_minutes || 30))),
        status,
        Math.min(3, Math.max(1, Number(body.priority || 2))),
        String(body.energy || "medium"),
        String(body.area || "سایر"),
        String(body.recurring_rule || "none"),
        body.created_by_ai ? 1 : 0,
        completedAt,
        now,
        now,
      )
      .run();

    const task = await bindings()
      .DB.prepare("SELECT * FROM tasks WHERE id = ? AND owner_id = ?")
      .bind(id, ownerId)
      .first();

    return Response.json({ ok: true, task }, { status: 201 });
  } catch (error) {
    const value = message(error);

    return Response.json(
      { ok: false, error: value },
      { status: value === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
