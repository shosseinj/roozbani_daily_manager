import { ensureOwner, userFromRequest } from "../../../../lib/server";
import { getPhdCommandCenter } from "../../../../modules/phd/server/repository";

export async function GET(request: Request) {
  try {
    const user = await userFromRequest(request);
    if (!user) throw new Error("UNAUTHORIZED");
    await ensureOwner(user.id, user.display_name);
    const data = await getPhdCommandCenter(user.id);
    return Response.json({ ok: true, user, ...data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load the PhD command center.";
    return Response.json({ ok: false, error: message }, { status: message === "UNAUTHORIZED" ? 401 : 500 });
  }
}
