import {
  assertSameOrigin,
  bindings,
  encryptSecret,
  ensureOwner,
  ownerIdFromRequest,
  telegramRequest,
} from "../../../lib/server";

type OpenRouterKeyResponse = {
  data?: {
    label?: string;
    limit?: number | null;
    limit_remaining?: number | null;
    usage?: number;
    is_free_tier?: boolean;
  };
  error?: {
    message?: string;
  };
  message?: string;
};

function message(error: unknown) {
  return error instanceof Error ? error.message : "خطای نامشخص";
}

function responseForError(error: unknown) {
  const value = message(error);
  const friendly = value === "CREDENTIAL_ENCRYPTION_KEY_NOT_CONFIGURED"
    ? "کلید رمزنگاری سرور تنظیم نشده است؛ CREDENTIAL_ENCRYPTION_KEY را در Cloudflare Secret ثبت کنید."
    : value === "INVALID_ORIGIN" ? "درخواست نامعتبر است." : value;

  return Response.json(
    { ok: false, error: friendly },
    { status: value === "UNAUTHORIZED" ? 401 : value === "INVALID_ORIGIN" ? 403 : 500 },
  );
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const ownerId = await ownerIdFromRequest(request);
    await ensureOwner(ownerId);

    const body = (await request.json()) as Record<string, unknown>;
    const action = String(body.action || "");
    const db = bindings().DB;
    const now = new Date().toISOString();

    if (action === "profile") {
      const displayName = String(body.display_name || "دوست من").trim() || "دوست من";

      await db
        .prepare(`
          UPDATE profiles
          SET
            display_name = ?,
            timezone = ?,
            day_start = ?,
            day_end = ?,
            planning_style = ?,
            updated_at = ?
          WHERE owner_id = ?
        `)
        .bind(
          displayName,
          String(body.timezone || "Asia/Tehran"),
          String(body.day_start || "08:00"),
          String(body.day_end || "22:00"),
          String(body.planning_style || "balanced"),
          now,
          ownerId,
        )
        .run();

      await db
        .prepare(`
          UPDATE users
          SET display_name = ?, updated_at = ?
          WHERE id = ?
        `)
        .bind(displayName, now, ownerId)
        .run();

      return Response.json({ ok: true });
    }

    if (action === "save_openrouter") {
      const rawKey = String(body.key || "");
      const key = rawKey
        .trim()
        .replace(/^['"]+/, "")
        .replace(/['"]+$/, "");
      const model = String(body.model || "openrouter/free").trim() || "openrouter/free";

      if (!key || !key.startsWith("sk-or-") || key.length < 20) {
        return Response.json(
          { ok: false, error: "فرمت کلید OpenRouter معتبر نیست." },
          { status: 400 },
        );
      }

      let verificationStatus: "verified" | "unverified" = "unverified";
      let verificationWarning: string | null = null;
      let keyInfo: OpenRouterKeyResponse["data"] | null = null;

      try {
        const validationResponse = await fetch("https://openrouter.ai/api/v1/key", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${key}`,
            Accept: "application/json",
          },
        });

        const validationData = (await validationResponse
          .json()
          .catch(() => null)) as OpenRouterKeyResponse | null;

        if (validationResponse.status === 401) {
          return Response.json(
            { ok: false, error: "کلید OpenRouter نامعتبر یا لغوشده است." },
            { status: 400 },
          );
        }

        if (validationResponse.ok) {
          verificationStatus = "verified";
          keyInfo = validationData?.data || null;
        } else {
          verificationWarning =
            validationData?.error?.message ||
            validationData?.message ||
            `بررسی کلید با وضعیت ${validationResponse.status} انجام نشد؛ کلید ذخیره شد و هنگام اولین درخواست دوباره آزمایش می‌شود.`;
        }
      } catch (error) {
        verificationWarning =
          error instanceof Error
            ? `بررسی اتصال انجام نشد: ${error.message}`
            : "بررسی اتصال انجام نشد؛ کلید ذخیره شد.";
      }

      const cipher = await encryptSecret(key);
      const hint = `${key.slice(0, 10)}••••${key.slice(-4)}`;

      await db
        .prepare(`
          INSERT INTO credentials (
            owner_id,
            openrouter_key_cipher,
            openrouter_key_hint,
            openrouter_model,
            telegram_webhook_status,
            updated_at
          )
          VALUES (?, ?, ?, ?, 'disconnected', ?)
          ON CONFLICT(owner_id) DO UPDATE SET
            openrouter_key_cipher = excluded.openrouter_key_cipher,
            openrouter_key_hint = excluded.openrouter_key_hint,
            openrouter_model = excluded.openrouter_model,
            updated_at = excluded.updated_at
        `)
        .bind(ownerId, cipher, hint, model, now)
        .run();

      return Response.json({
        ok: true,
        hint,
        model,
        verification_status: verificationStatus,
        warning: verificationWarning,
        key_info: keyInfo,
      });
    }

    if (action === "disconnect_openrouter") {
      await db
        .prepare(`
          UPDATE credentials
          SET
            openrouter_key_cipher = NULL,
            openrouter_key_hint = NULL,
            updated_at = ?
          WHERE owner_id = ?
        `)
        .bind(now, ownerId)
        .run();

      return Response.json({ ok: true });
    }

    if (action === "connect_telegram") {
      const token = String(body.token || "").trim();

      if (!/^\d{6,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
        return Response.json(
          { ok: false, error: "توکن ربات تلگرام معتبر نیست." },
          { status: 400 },
        );
      }

      const me = (await telegramRequest(token, "getMe", {})) as {
        username?: string;
        first_name?: string;
      };
      const secret = crypto.randomUUID().replaceAll("-", "");
      const origin = new URL(request.url).origin;
      const webhookUrl = `${origin}/api/telegram/${secret}`;

      await telegramRequest(token, "setWebhook", {
        url: webhookUrl,
        allowed_updates: ["message", "callback_query"],
        drop_pending_updates: false,
      });

      await db
        .prepare(`
          UPDATE credentials
          SET
            telegram_token_cipher = ?,
            telegram_bot_name = ?,
            telegram_webhook_secret = ?,
            telegram_webhook_status = 'connected',
            updated_at = ?
          WHERE owner_id = ?
        `)
        .bind(
          await encryptSecret(token),
          me.username || me.first_name || "Telegram Bot",
          secret,
          now,
          ownerId,
        )
        .run();

      return Response.json({
        ok: true,
        bot_name: me.username || me.first_name,
        webhook_url: webhookUrl,
      });
    }

    if (action === "disconnect_telegram") {
      await db
        .prepare(`
          UPDATE credentials
          SET
            telegram_token_cipher = NULL,
            telegram_bot_name = NULL,
            telegram_chat_id = NULL,
            telegram_webhook_secret = NULL,
            telegram_webhook_status = 'disconnected',
            updated_at = ?
          WHERE owner_id = ?
        `)
        .bind(now, ownerId)
        .run();

      return Response.json({ ok: true });
    }

    return Response.json(
      { ok: false, error: "درخواست تنظیمات شناخته نشد." },
      { status: 400 },
    );
  } catch (error) {
    return responseForError(error);
  }
}
