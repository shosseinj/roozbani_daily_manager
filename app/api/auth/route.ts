import {
  assertSameOrigin,
  checkAuthRateLimit,
  clearSessionCookie,
  createAccountWithSession,
  createSession,
  deleteSession,
  ensureDatabase,
  ensureOwner,
  findUserByUsername,
  hashPassword,
  recordAuthAttempt,
  sessionCookie,
  userFromRequest,
  upgradePasswordHash,
  verifyPassword,
} from "../../../lib/server";

type AuthBody = {
  action?: "login" | "signup";
  username?: string;
  password?: string;
  confirm_password?: string;
  display_name?: string;
};

function normalizeUsername(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function isValidUsername(username: string) {
  return /^[a-z0-9_.-]{3,32}$/.test(username);
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "خطای نامشخص";
}

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await ensureDatabase();

    const body = (await request.json().catch(() => ({}))) as AuthBody;
    const action = body.action === "signup" ? "signup" : "login";
    const username = normalizeUsername(body.username);
    const password = String(body.password ?? "");

    const rateLimitKeys = await checkAuthRateLimit(request, username || "invalid-identity");

    if (!isValidUsername(username)) {
      return Response.json(
        {
          ok: false,
          error:
            "نام کاربری باید ۳ تا ۳۲ کاراکتر و فقط شامل حروف انگلیسی، عدد، نقطه، خط تیره یا زیرخط باشد.",
        },
        { status: 400 },
      );
    }

    if (password.length < 8 || password.length > 128) {
      return Response.json(
        {
          ok: false,
          error: "رمز عبور باید بین ۸ تا ۱۲۸ کاراکتر باشد.",
        },
        { status: 400 },
      );
    }

    if (action === "signup") {
      const confirmPassword = String(body.confirm_password ?? "");
      const displayName = String(body.display_name ?? "").trim();

      if (!displayName || displayName.length > 80) {
        return Response.json(
          { ok: false, error: "نام نمایشی معتبر وارد کنید." },
          { status: 400 },
        );
      }

      if (password !== confirmPassword) {
        return Response.json(
          { ok: false, error: "رمز عبور و تکرار آن یکسان نیستند." },
          { status: 400 },
        );
      }

      const existingUser = await findUserByUsername(username);

      if (existingUser) {
        const canRecover = existingUser.is_active === 1 && await verifyPassword(
          password, existingUser.password_hash, existingUser.password_salt, existingUser.password_iterations,
        );
        if (canRecover) {
          await ensureOwner(existingUser.id, existingUser.display_name || displayName);
          await upgradePasswordHash(existingUser.id, password, existingUser.password_iterations);
          const recoveredSession = await createSession(existingUser.id);
          await recordAuthAttempt(rateLimitKeys, "signup-recover", true);
          return Response.json(
            { ok: true, recovered: true, user: { id: existingUser.id, username, display_name: existingUser.display_name || displayName } },
            { headers: { "set-cookie": sessionCookie(request, recoveredSession) } },
          );
        }
        return Response.json(
          { ok: false, error: "این نام کاربری قبلاً ثبت شده است." },
          { status: 409 },
        );
      }

      const userId = crypto.randomUUID();
      const passwordData = await hashPassword(password);

      try {
        const sessionToken = await createAccountWithSession({
          userId,
          username,
          displayName,
          passwordHash: passwordData.hash,
          passwordSalt: passwordData.salt,
          passwordIterations: passwordData.iterations,
        });
        await recordAuthAttempt(rateLimitKeys, "signup", true);

        return Response.json(
          { ok: true, user: { id: userId, username, display_name: displayName } },
          { status: 201, headers: { "set-cookie": sessionCookie(request, sessionToken) } },
        );
      } catch (error) {
        if (errorMessage(error).toLowerCase().includes("unique")) {
          return Response.json(
            { ok: false, error: "این نام کاربری قبلاً ثبت شده است." },
            { status: 409 },
          );
        }

        throw error;
      }
    }

    const user = await findUserByUsername(username);
    const isPasswordValid =
      Boolean(user) &&
      user?.is_active === 1 &&
      (await verifyPassword(
        password,
        user.password_hash,
        user.password_salt,
        user.password_iterations,
      ));

    if (!user || !isPasswordValid) {
      await recordAuthAttempt(rateLimitKeys, "login", false);
      return Response.json(
        { ok: false, error: "نام کاربری یا رمز عبور صحیح نیست." },
        { status: 401 },
      );
    }

    await upgradePasswordHash(user.id, password, user.password_iterations);
    const sessionToken = await createSession(user.id);
    await recordAuthAttempt(rateLimitKeys, "login", true);

    return Response.json(
      {
        ok: true,
        user: {
          id: user.id,
          username: user.username,
          display_name: user.display_name,
        },
      },
      {
        headers: {
          "set-cookie": sessionCookie(request, sessionToken),
        },
      },
    );
  } catch (error) {
    const value = errorMessage(error);
    const requestId = request.headers.get("cf-ray") || crypto.randomUUID();
    console.error("Authentication failed", { requestId, message: value, stack: error instanceof Error ? error.stack : undefined });
    if (value === "AUTH_RATE_LIMITED") {
      return Response.json({ ok: false, error: "تلاش‌های ورود بیش از حد بوده است؛ ۱۵ دقیقه دیگر دوباره امتحان کنید." }, { status: 429 });
    }
    if (value === "INVALID_ORIGIN") {
      return Response.json({ ok: false, error: "درخواست نامعتبر است." }, { status: 403 });
    }

    const diagnostic = authDiagnostic(value);

    return Response.json(
      { ok: false, error: diagnostic.message, code: diagnostic.code, request_id: requestId },
      { status: 500 },
    );
  }
}

function authDiagnostic(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes("d1 binding is not available")) {
    return { code: "DB_BINDING_MISSING", message: "پایگاه داده D1 به Worker متصل نیست. Binding با نام DB را در Cloudflare تنظیم کنید." };
  }
  if (normalized.includes("no such table") || normalized.includes("no such column") || normalized.includes("d1_error")) {
    return { code: "DB_SCHEMA_ERROR", message: "ساختار پایگاه داده آماده نیست. migrationهای D1 را اجرا و دوباره امتحان کنید." };
  }
  if (normalized.includes("foreign key")) {
    return { code: "DB_INTEGRITY_ERROR", message: "پایگاه داده با نسخه فعلی سازگار نیست؛ migrationهای D1 را بررسی کنید." };
  }
  if (normalized.includes("pbkdf2") || normalized.includes("derivebits") || normalized.includes("operationerror")) {
    return { code: "PASSWORD_HASH_ERROR", message: "هش‌کردن رمز عبور در محیط Worker انجام نشد. compatibility_date و Web Crypto را بررسی کنید." };
  }
  return { code: "AUTH_INTERNAL_ERROR", message: "ورود یا ثبت‌نام در سرور کامل نشد. شناسه خطا را در Cloudflare Logs جست‌وجو کنید." };
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

    return Response.json({ ok: true, user });
  } catch (error) {
    return Response.json(
      { ok: false, error: errorMessage(error) },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    assertSameOrigin(request);
    await deleteSession(request);

    return Response.json(
      { ok: true },
      {
        headers: {
          "set-cookie": clearSessionCookie(request),
        },
      },
    );
  } catch (error) {
    return Response.json(
      { ok: false, error: errorMessage(error) },
      { status: 500 },
    );
  }
}
