import { assertSameOrigin, ensureOwner, ownerIdFromRequest } from "../../../../lib/server";
import { addManualPosition, scheduleJourneyAction, trackApplication } from "../../../../modules/phd/server/repository";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await ownerIdFromRequest(request);
    await ensureOwner(ownerId);
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || "");

    if (action === "track_application") {
      const positionId = required(body.positionId, "positionId");
      return Response.json({ ok: true, application: await trackApplication(ownerId, positionId) });
    }

    if (action === "add_position") {
      const deadline = String(body.deadline || "");
      if (deadline && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) {
        return Response.json({ ok: false, error: "تاریخ ددلاین معتبر نیست." }, { status: 400 });
      }
      const url = String(body.url || "").trim();
      if (url && !/^https?:\/\//i.test(url)) {
        return Response.json({ ok: false, error: "لینک موقعیت باید با http یا https شروع شود." }, { status: 400 });
      }
      const position = await addManualPosition(ownerId, {
        title: required(body.title, "title").slice(0, 220),
        university: required(body.university, "university").slice(0, 160),
        professor: String(body.professor || "").trim().slice(0, 120),
        country: required(body.country, "country").slice(0, 80),
        city: String(body.city || "").trim().slice(0, 80),
        researchArea: required(body.researchArea, "researchArea").slice(0, 300),
        description: String(body.description || "").trim().slice(0, 3000),
        url: url.slice(0, 1000),
        fundingStatus: String(body.fundingStatus || "unknown"),
        fundingAmount: String(body.fundingAmount || "").trim().slice(0, 120),
        deadline,
      });
      return Response.json({ ok: true, position }, { status: 201 });
    }

    if (action === "schedule") {
      const scheduledDate = required(body.scheduledDate, "scheduledDate");
      const startTime = required(body.startTime, "startTime");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(scheduledDate) || !/^\d{2}:\d{2}$/.test(startTime)) {
        return Response.json({ ok: false, error: "A valid date and time are required." }, { status: 400 });
      }
      const result = await scheduleJourneyAction(ownerId, {
        entityType: required(body.entityType, "entityType"),
        entityId: required(body.entityId, "entityId"),
        actionType: required(body.actionType, "actionType"),
        title: required(body.title, "title"),
        notes: String(body.notes || ""),
        scheduledDate,
        startTime,
        durationMinutes: Number(body.durationMinutes || 30),
        area: String(body.area || "اپلای دکتری"),
      });
      return Response.json({ ok: true, ...result }, { status: result.created ? 201 : 200 });
    }

    return Response.json({ ok: false, error: "Unsupported action." }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The action could not be completed.";
    const status = message.includes("required") || message === "POSITION_NOT_FOUND" ? 400 : message === "UNAUTHORIZED" ? 401 : 500;
    return Response.json({ ok: false, error: message }, { status });
  }
}

function required(value: unknown, field: string) {
  const result = String(value || "").trim();
  if (!result) throw new Error(`${field} is required`);
  return result;
}
