import { bindings, decryptSecret, ensureDatabase, isoDateInTimezone, openRouter, parseJsonObject, telegramRequest } from "../../../../lib/server";

type TelegramUpdate = {
  message?: { chat: { id: number }; text?: string; from?: { first_name?: string } };
  callback_query?: { id: string; data?: string; message?: { chat: { id: number } } };
};

export async function POST(request: Request, context: { params: Promise<{ secret: string }> }) {
  try {
    await ensureDatabase();
    const { secret } = await context.params;
    const credential = await bindings().DB.prepare(`SELECT owner_id,telegram_token_cipher,telegram_bot_name
      FROM credentials WHERE telegram_webhook_secret=? AND telegram_webhook_status='connected'`).bind(secret)
      .first<{ owner_id: string; telegram_token_cipher: string; telegram_bot_name: string | null }>();
    if (!credential?.telegram_token_cipher) return new Response("not found", { status: 404 });
    const token = await decryptSecret(credential.telegram_token_cipher);
    const update = await request.json() as TelegramUpdate;

    if (update.callback_query) {
      const chatId = update.callback_query.message?.chat.id;
      const [action, id] = String(update.callback_query.data || "").split(":");
      if (chatId && id && action === "done") {
        await bindings().DB.prepare("UPDATE tasks SET status='done',completed_at=?,updated_at=? WHERE id=? AND owner_id=?")
          .bind(new Date().toISOString(), new Date().toISOString(), id, credential.owner_id).run();
        await telegramRequest(token, "answerCallbackQuery", { callback_query_id: update.callback_query.id, text: "انجام شد ✓" });
      }
      return Response.json({ ok: true });
    }

    const chatId = update.message?.chat.id;
    const text = update.message?.text?.trim();
    if (!chatId || !text) return Response.json({ ok: true });
    await bindings().DB.prepare("UPDATE credentials SET telegram_chat_id=?,updated_at=? WHERE owner_id=?")
      .bind(String(chatId), new Date().toISOString(), credential.owner_id).run();

    if (text === "/start") {
      await send(token, chatId, `سلام ${update.message?.from?.first_name || ""} 👋\nمن روزبانی هستم. کارهایت را طبیعی بنویس؛ مثلا:\n«فردا ساعت ۱۰، ۴۵ دقیقه گزارش را کامل کن»\n\n/today کارهای امروز\n/week مرور هفته\n/month مرور ماه`);
      return Response.json({ ok: true });
    }

    if (["/today", "/week", "/month"].includes(text)) {
      const today = isoDateInTimezone();
      const days = text === "/today" ? 0 : text === "/week" ? 7 : 31;
      const end = new Date(`${today}T12:00:00Z`); end.setUTCDate(end.getUTCDate() + days);
      const to = isoDateInTimezone(end);
      const rows = await bindings().DB.prepare(`SELECT id,title,scheduled_date,start_time,status FROM tasks
        WHERE owner_id=? AND scheduled_date BETWEEN ? AND ? AND status NOT IN ('deleted','cancelled') ORDER BY scheduled_date,start_time LIMIT 40`)
        .bind(credential.owner_id, today, to).all<Record<string, unknown>>();
      if (!rows.results?.length) await send(token, chatId, "برای این بازه کاری ثبت نشده است.");
      else {
        for (const task of rows.results) {
          await telegramRequest(token, "sendMessage", {
            chat_id: chatId,
            text: `${task.status === "done" ? "✅" : "◯"} ${task.title}\n${task.scheduled_date} — ${task.start_time}`,
            reply_markup: task.status === "done" ? undefined : { inline_keyboard: [[{ text: "انجام شد ✓", callback_data: `done:${task.id}` }]] },
          });
        }
      }
      return Response.json({ ok: true });
    }

    try {
      const today = isoDateInTimezone();
      const ai = await openRouter(credential.owner_id, [{ role: "user", content: `امروز ${today} است. متن زیر را به یک کار تبدیل کن و فقط JSON معتبر بده:
{"title":"...","scheduled_date":"YYYY-MM-DD","start_time":"HH:mm","duration_minutes":30,"priority":2,"energy":"medium","area":"سایر"}\nمتن: ${text}` }]);
      const draft = parseJsonObject(ai.text) as Record<string, unknown>;
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      await bindings().DB.prepare(`INSERT INTO tasks
        (id,owner_id,title,notes,scheduled_date,start_time,duration_minutes,status,priority,energy,area,recurring_rule,created_by_ai,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          id, credential.owner_id, String(draft.title || text), "ثبت‌شده از تلگرام", String(draft.scheduled_date || today),
          String(draft.start_time || "09:00"), Number(draft.duration_minutes || 30), "pending", Number(draft.priority || 2),
          String(draft.energy || "medium"), String(draft.area || "سایر"), "none", 1, now, now,
        ).run();
      await send(token, chatId, `ثبت شد ✓\n${draft.title}\n${draft.scheduled_date} ساعت ${draft.start_time}\n${draft.duration_minutes || 30} دقیقه`);
    } catch (error) {
      await send(token, chatId, `نتوانستم این پیام را به کار تبدیل کنم. تنظیمات OpenRouter را در وب‌سایت بررسی کن.\n${error instanceof Error ? error.message.slice(0, 120) : ""}`);
    }
    return Response.json({ ok: true });
  } catch {
    return new Response("ok", { status: 200 });
  }
}

function send(token: string, chatId: number, text: string) {
  return telegramRequest(token, "sendMessage", { chat_id: chatId, text });
}

