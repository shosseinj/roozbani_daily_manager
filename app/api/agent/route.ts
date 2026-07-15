import { assertSameOrigin, bindings, ensureOwner, isoDateInTimezone, openRouter, ownerIdFromRequest, parseJsonObject } from "../../../lib/server";
import { createTaskProposal } from "../../../modules/agent/server/task-tool-service";
import { loadPhdAgentContext } from "../../../modules/phd/server/repository";

const persona = `تو «روزبانی» هستی؛ دستیار اجرایی فارسی‌زبان برای برنامه‌ریزی روزانه و مسیر اپلای دکتری.
پاسخ‌ها کوتاه، روشن، مهربان و عملی باشند. ظرفیت واقعی، استراحت و تداخل زمانی را رعایت کن.
تو می‌توانی کار بسازی، ویرایش کنی، جابه‌جا کنی، انجام‌شده علامت بزنی یا حذف کنی؛ اما هر تغییر باید اول به‌صورت پیشنهاد برگردد و فقط بعد از تأیید کاربر اعمال شود.
هرگز ادعا نکن کاری اعمال شده مگر وضعیت proposal واقعاً applied باشد. هرگز ایمیل را خودکار ارسال نکن.
کلید API، توکن و اطلاعات محرمانه را تکرار نکن.`;

const capabilityText = `می‌توانم برنامه‌ات را ببینم و درباره اولویت‌ها پاسخ بدهم؛ همچنین می‌توانم برایت کار بسازم، زمان یا جزئیاتش را تغییر بدهم، انجام‌شده علامت بزنم یا حذفش کنم. هر تغییر ابتدا به‌صورت پیش‌نمایش نشان داده می‌شود و فقط با تأیید تو اعمال خواهد شد. برای مسیر دکتری هم موقعیت‌ها، اپلیکیشن‌ها، ددلاین‌ها، تمرین انگلیسی و کارهای مهاجرتی را با برنامه روزانه هماهنگ می‌کنم.`;

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await ownerIdFromRequest(request);
    await ensureOwner(ownerId);
    const body = await request.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action || "chat");
    const input = String(body.input || "").trim();
    const today = isoDateInTimezone();
    const taskRows = await bindings().DB.prepare(`SELECT id,title,notes,scheduled_date,start_time,duration_minutes,status,priority,energy,area
      FROM tasks WHERE owner_id=? AND status NOT IN ('deleted','cancelled') ORDER BY scheduled_date,start_time LIMIT 250`)
      .bind(ownerId).all();
    const tasks = (taskRows.results || []) as Array<Record<string, unknown>>;

    if (action === "capture") {
      if (!input) return Response.json({ ok: false, error: "متن کار را بنویس." }, { status: 400 });
      const result = await openRouter(ownerId, [{ role: "user", content: `${persona}\nامروز ${today} است. متن کاربر را به کار تبدیل کن.
فقط JSON معتبر بده: {"summary":"...","tasks":[{"title":"...","scheduled_date":"YYYY-MM-DD","start_time":"HH:mm","duration_minutes":30,"priority":1,"energy":"medium","area":"کار"}]}
تاریخ خروجی برای ذخیره‌سازی ISO است؛ رابط آن را شمسی نمایش می‌دهد. متن کاربر: ${input}` }]);
      return Response.json({ ok: true, proposal: parseJsonObject(result.text), model: result.model });
    }

    const selected = filterRange(tasks, body);
    const taskContext = selected.map((task) => `${task.id} | ${task.scheduled_date} ${task.start_time} | ${task.title} | ${task.duration_minutes}m | ${task.status} | P${task.priority} | ${task.area}`).join("\n") || "کاری ثبت نشده است.";

    if (action === "plan" || action === "report") {
      const instruction = action === "plan"
        ? "برای این بازه برنامه اجرایی کوتاه بساز؛ سه تمرکز، تداخل‌ها و زمان خالی را بگو. هیچ تغییری را اعمال نکن."
        : "گزارش عملکرد بساز: نرخ انجام، زمان برنامه‌ریزی، مانع احتمالی و سه پیشنهاد عملی.";
      const result = await openRouter(ownerId, [{ role: "system", content: persona }, { role: "user", content: `${instruction}\n${taskContext}` }]);
      await saveMessage(ownerId, "assistant", result.text);
      return Response.json({ ok: true, text: result.text, model: result.model });
    }

    if (!input) return Response.json({ ok: false, error: "پیامت را بنویس." }, { status: 400 });
    await saveMessage(ownerId, "user", input);

    if (isCapabilityQuestion(input)) {
      await saveMessage(ownerId, "assistant", capabilityText);
      return Response.json({ ok: true, text: capabilityText, mode: "local" });
    }

    const phdContext = await loadPhdAgentContext(ownerId).catch(() => "PhD context is not available yet.");
    const recentMessages = await bindings().DB.prepare(`SELECT role,content FROM agent_messages WHERE owner_id=?
      ORDER BY created_at DESC LIMIT 10`).bind(ownerId).all<Record<string, unknown>>();
    const history = [...(recentMessages.results || [])].reverse().map((row) => `${row.role}: ${row.content}`).join("\n");
    const prompt = `${persona}
امروز در ذخیره‌سازی ${today} است. رابط کاربری همه تاریخ‌ها را شمسی نشان می‌دهد.
کارهای کاربر (شناسه دقیق در ابتدای هر خط):
${taskContext}

زمینه مسیر دکتری:
${phdContext}

گفت‌وگوی اخیر:
${history}

پیام تازه کاربر: ${input}

فقط JSON معتبر و بدون markdown برگردان:
{"kind":"answer|proposal","message":"پاسخ کوتاه فارسی","summary":"خلاصه تغییرات","operations":[]}
اگر کاربر فقط سؤال یا درخواست برنامه/تحلیل دارد kind=answer و operations=[] باشد.
اگر صریحاً خواست کاری اضافه، ویرایش، جابه‌جا، تکمیل یا حذف شود kind=proposal باشد.
operationهای مجاز:
create: {"type":"create","title":"...","notes":"...","scheduled_date":"YYYY-MM-DD","start_time":"HH:mm","duration_minutes":30,"priority":1|2|3,"energy":"high|medium|low","area":"..."}
update: {"type":"update","task_id":"شناسه موجود دقیق","title":"اختیاری","scheduled_date":"اختیاری YYYY-MM-DD","start_time":"اختیاری HH:mm","duration_minutes":30,"status":"pending|in_progress|done|cancelled","priority":1|2|3,"energy":"high|medium|low","area":"اختیاری"}
delete: {"type":"delete","task_id":"شناسه موجود دقیق"}
برای تغییر یا حذف فقط از شناسه‌های موجود بالا استفاده کن. اگر هدف مبهم است kind=answer بده و سؤال روشن‌کننده بپرس.`;

    const result = await openRouter(ownerId, [{ role: "user", content: prompt }]);
    const parsed = parseJsonObject(result.text) as Record<string, unknown>;
    const message = String(parsed.message || result.text).trim();
    let proposal = null;

    if (String(parsed.kind) === "proposal" && Array.isArray(parsed.operations) && parsed.operations.length) {
      proposal = await createTaskProposal(ownerId, String(parsed.summary || message), parsed.operations);
    }

    await saveMessage(ownerId, "assistant", message);
    return Response.json({ ok: true, text: message, proposal, model: result.model });
  } catch (error) {
    const value = error instanceof Error ? error.message : "خطای نامشخص";
    const messages: Record<string, string> = {
      OPENROUTER_NOT_CONNECTED: "ابتدا کلید OpenRouter را در تنظیمات ذخیره کن.",
      TASK_NOT_FOUND: "کاری که باید تغییر کند پیدا نشد؛ لطفاً دوباره با نام دقیق آن بگو.",
      NO_VALID_OPERATIONS: "پیشنهاد قابل‌اعمالی ساخته نشد؛ درخواست را کمی دقیق‌تر بنویس.",
      INVALID_ORIGIN: "درخواست نامعتبر است.",
    };
    const status = value === "UNAUTHORIZED" ? 401 : value === "INVALID_ORIGIN" ? 403 : 502;
    return Response.json({ ok: false, error: messages[value] || value }, { status });
  }
}

function filterRange(tasks: Array<Record<string, unknown>>, body: Record<string, unknown>) {
  const from = String(body.from || "0000-01-01");
  const to = String(body.to || "9999-12-31");
  return tasks.filter((task) => String(task.scheduled_date || "") >= from && String(task.scheduled_date || "") <= to);
}

function isCapabilityQuestion(input: string) {
  const normalized = input.toLowerCase();
  return ["چه کار", "چکار", "چه کمکی", "قابلیت", "what can you", "help me with"].some((term) => normalized.includes(term));
}

async function saveMessage(ownerId: string, role: "user" | "assistant", content: string) {
  await bindings().DB.prepare("INSERT INTO agent_messages (id,owner_id,role,content,created_at) VALUES (?,?,?,?,?)")
    .bind(crypto.randomUUID(), ownerId, role, content.slice(0, 6000), new Date().toISOString()).run();
}
