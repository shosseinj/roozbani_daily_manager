import {
  assertSameOrigin,
  bindings,
  ensureOwner,
  ownerIdFromRequest,
} from "../../../../lib/server";

function message(error: unknown) {
  return error instanceof Error ? error.message : "خطای نامشخص";
}

function invalidTaskId(id: string) {
  return !id || id === "undefined" || id === "null";
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const ownerId = await ownerIdFromRequest(request);
    await ensureOwner(ownerId);

    const { id } = await context.params;

    if (invalidTaskId(id)) {
      return Response.json(
        { ok: false, error: "شناسه کار معتبر نیست." },
        { status: 400 },
      );
    }

    const body = (await request.json()) as Record<string, unknown>;
    const existing = await bindings()
      .DB.prepare("SELECT * FROM tasks WHERE id = ? AND owner_id = ?")
      .bind(id, ownerId)
      .first<Record<string, unknown>>();

    if (!existing) {
      return Response.json(
        { ok: false, error: "کار پیدا نشد." },
        { status: 404 },
      );
    }

    const requestedStatus = String(body.status ?? existing.status);
    const status = ["pending", "in_progress", "done", "cancelled"].includes(requestedStatus)
      ? requestedStatus
      : String(existing.status);
    const completedAt =
      status === "done"
        ? String(existing.completed_at || new Date().toISOString())
        : null;

    await bindings()
      .DB.prepare(`
        UPDATE tasks
        SET
          title = ?,
          notes = ?,
          scheduled_date = ?,
          start_time = ?,
          duration_minutes = ?,
          status = ?,
          priority = ?,
          energy = ?,
          area = ?,
          recurring_rule = ?,
          completed_at = ?,
          updated_at = ?
        WHERE id = ? AND owner_id = ?
      `)
      .bind(
        String(body.title ?? existing.title),
        String(body.notes ?? existing.notes ?? "") || null,
        String(body.scheduled_date ?? existing.scheduled_date),
        String(body.start_time ?? existing.start_time),
        Math.min(720, Math.max(5, Number(body.duration_minutes ?? existing.duration_minutes))),
        status,
        Math.min(3, Math.max(1, Number(body.priority ?? existing.priority))),
        String(body.energy ?? existing.energy),
        String(body.area ?? existing.area),
        String(body.recurring_rule ?? existing.recurring_rule),
        completedAt,
        new Date().toISOString(),
        id,
        ownerId,
      )
      .run();

    const task = await bindings()
      .DB.prepare("SELECT * FROM tasks WHERE id = ? AND owner_id = ?")
      .bind(id, ownerId)
      .first();

    return Response.json({ ok: true, task });
  } catch (error) {
    const value = message(error);

    return Response.json(
      { ok: false, error: value },
      { status: value === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    assertSameOrigin(request);
    const ownerId = await ownerIdFromRequest(request);
    const { id } = await context.params;

    if (invalidTaskId(id)) {
      return Response.json(
        { ok: false, error: "شناسه کار معتبر نیست." },
        { status: 400 },
      );
    }

    await bindings()
      .DB.prepare(`
        UPDATE tasks
        SET status = 'deleted', updated_at = ?
        WHERE id = ? AND owner_id = ?
      `)
      .bind(new Date().toISOString(), id, ownerId)
      .run();

    return Response.json({ ok: true });
  } catch (error) {
    const value = message(error);

    return Response.json(
      { ok: false, error: value },
      { status: value === "UNAUTHORIZED" ? 401 : 500 },
    );
  }
}
