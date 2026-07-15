import { assertSameOrigin, ensureOwner, ownerIdFromRequest } from "../../../../lib/server";
import { applyProposal, listAgentActivity, rejectProposal, undoProposal } from "../../../../modules/agent/server/task-tool-service";

export async function GET(request: Request) {
  try {
    const ownerId = await ownerIdFromRequest(request);
    await ensureOwner(ownerId);
    return Response.json({ ok: true, ...(await listAgentActivity(ownerId)) }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await ownerIdFromRequest(request);
    await ensureOwner(ownerId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "");
    const proposalId = String(body.proposalId || "").trim();
    if (!proposalId) return Response.json({ ok: false, error: "شناسه پیشنهاد لازم است." }, { status: 400 });

    if (action === "apply") return Response.json({ ok: true, ...(await applyProposal(ownerId, proposalId)) });
    if (action === "reject") return Response.json({ ok: true, proposal: await rejectProposal(ownerId, proposalId) });
    if (action === "undo") return Response.json({ ok: true, proposal: await undoProposal(ownerId, proposalId) });
    return Response.json({ ok: false, error: "عملیات پشتیبانی نمی‌شود." }, { status: 400 });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  const value = error instanceof Error ? error.message : "خطای نامشخص";
  const messages: Record<string, string> = {
    PROPOSAL_NOT_FOUND: "پیشنهاد پیدا نشد.", PROPOSAL_NOT_PENDING: "این پیشنهاد قبلاً بررسی شده است.",
    PROPOSAL_NOT_APPLIED: "فقط تغییر اعمال‌شده قابل بازگردانی است.", PROPOSAL_EXPIRED: "زمان این پیشنهاد تمام شده است.",
    TASK_NOT_FOUND: "یکی از کارهای هدف دیگر وجود ندارد.", UNDO_CONFLICT: "بعد از اعمال، کار دوباره تغییر کرده است؛ بازگردانی خودکار امن نیست.",
    INVALID_ORIGIN: "درخواست نامعتبر است.",
  };
  const status = value === "UNAUTHORIZED" ? 401 : value === "INVALID_ORIGIN" ? 403 : value.includes("PROPOSAL") || value.includes("TASK") || value === "UNDO_CONFLICT" ? 409 : 500;
  return Response.json({ ok: false, error: messages[value] || value }, { status });
}
