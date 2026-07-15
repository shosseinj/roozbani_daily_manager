# Roozbani OS

روزبانی یک اپلیکیشن فارسی‌محور و چندکاربره برای برنامه‌ریزی روزانه، مدیریت مسیر پژوهش و اپلای دکتری است. کل UI، API و منطق عامل در یک Cloudflare Worker اجرا می‌شود و Cloudflare D1 داده‌های هر کاربر را جداگانه نگه می‌دارد.

## قابلیت‌های عملیاتی

- ثبت‌نام، ورود، خروج و جداسازی کامل داده‌های کاربران
- رمز عبور PBKDF2-SHA-256 با ۱۰۰٬۰۰۰ تکرار سازگار با محدودیت CPU در Cloudflare Workers، session token هش‌شده و cookie امن
- محدودسازی تلاش ورود، کنترل same-origin و ارتقای خودکار هش‌های قدیمی هنگام ورود
- تقویم و انتخاب‌گر تاریخ جلالی برای روز، هفته، ماه و فرم ساخت/ویرایش کار
- ذخیره تاریخ به‌صورت Gregorian ISO فقط در لایه API/D1 برای مرتب‌سازی پایدار
- ساخت، ویرایش، تکمیل و حذف کارها و مرکز اعلان کارهای نزدیک/عقب‌افتاده
- عامل عملیاتی «روزبانی» با گفت‌وگو، تاریخچه، پیشنهاد ساختاریافته، تأیید، رد و بازگردانی امن
- OpenRouter چندمدلی با کلید رمزنگاری‌شده مستقل برای هر کاربر
- مرکز PhD در مسیر `/phd`: موقعیت‌ها، فیلتر، امتیاز تطابق قابل توضیح، CRM اولیه و Planner Bridge
- ورود دستی موقعیت از لینک/منبع شخصی با ددلاین شمسی و محاسبه فوری Match Score
- برنامه‌های پژوهش، انگلیسی، مدارک و مهاجرت که مستقیم وارد پلنر اصلی می‌شوند
- قراردادهای source adapter برگرفته از scraper قبلی، بدون Playwright یا دورزدن محدودیت سایت‌ها

روزبانی هیچ تغییر پیشنهادی را بدون فشردن «تأیید و اعمال» اجرا نمی‌کند و ایمیل را خودکار ارسال نخواهد کرد.

## معماری

```text
app/                    UI و route handlerها
modules/agent/          عملیات و audit عامل
modules/phd/            domain، scoring، source contracts و repository
lib/server.ts           composition root سازگار با Worker
db/ + drizzle/          schema و migrationهای D1
worker/                 ورودی Cloudflare Worker
```

ماژول PhD از طریق `planner_links` به جدول اصلی `tasks` متصل می‌شود. بنابراین تقویم قدیمی منبع حقیقت باقی مانده و retries باعث ایجاد تسک تکراری نمی‌شوند.

## اجرای محلی

نیازمندی: Node.js 22.13 یا جدیدتر.

```bash
npm ci
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

پروژه registry عمومی `https://registry.npmjs.org/` را در `.npmrc` مشخص می‌کند. اگر محیط شما registry سازمانی دیگری را به‌صورت سراسری تحمیل کرده است، نصب را این‌گونه اجرا کنید:

```bash
npm ci --registry=https://registry.npmjs.org/
```

در `.dev.vars` یک کلید دائمی و تصادفی قرار دهید:

```env
CREDENTIAL_ENCRYPTION_KEY=replace-with-a-long-random-key
OPENROUTER_API_KEY=
```

تغییر `CREDENTIAL_ENCRYPTION_KEY` باعث غیرقابل‌خواندن شدن credentialهای قبلی می‌شود.

## استقرار روی Cloudflare Workers

1. ورود و ساخت D1 (اگر از D1 موجود در `wrangler.jsonc` استفاده نمی‌کنید):

```bash
npx wrangler login
npx wrangler d1 create roozbani-prod
```

`database_id` خروجی را در `wrangler.jsonc` جایگزین کنید.

2. اعمال migrationها:

```bash
npm run db:migrate:remote
```

3. ثبت secret دائمی:

```bash
npx wrangler secret put CREDENTIAL_ENCRYPTION_KEY
```

کلید مشترک OpenRouter اختیاری است؛ حالت توصیه‌شده این است که هر کاربر کلید خود را در تنظیمات وارد کند.

```bash
npx wrangler secret put OPENROUTER_API_KEY
```

4. ساخت و استقرار:

```bash
npm run deploy
```

پس از deploy، آماده‌بودن D1 را بررسی کنید:

```bash
curl https://YOUR-WORKER.workers.dev/api/health
```

خروجی سالم باید شامل `"ok":true` و `"database":"ready"` باشد. اگر `DB_BINDING_MISSING` مشاهده شد، Worker با binding دیگری منتشر شده است؛ اگر schema آماده نبود، `npm run db:migrate:remote` را اجرا کنید.

اسکریپت deploy از `dist/server/wrangler.json` استفاده می‌کند؛ Worker کامپایل‌شده و assets کلاینت با هم منتشر می‌شوند.

## کنترل کیفیت

```bash
npm run typecheck
npm run lint
npm test
npx wrangler deploy --dry-run --config dist/server/wrangler.json
```

تست‌های دستی تاییدشده شامل دو حساب مستقل، CRUD کار، پاسخ محلی قابلیت‌های عامل، اعمال/بازگردانی proposal، CRM موقعیت، Planner Bridge و idempotency آن است.

## مدل تاریخ

```text
نمایش کاربر:  ۱۴۰۵/۰۵/۰۶
API و D1:     2026-07-28
```

این تبدیل عمدی است؛ کاربر همیشه تاریخ شمسی می‌بیند و پایگاه داده مقدار استاندارد قابل مرتب‌سازی ذخیره می‌کند.

## نقشه راه

معماری و milestoneهای بعدی در `docs/architecture/phd-os-roadmap.md` قرار دارد. اولویت بعدی: ingestion زمان‌بندی‌شده و Worker-safe، نسخه‌بندی CV/SOP در R2، تحلیل استاد/مقاله و سپس workflow ایمیل با تأیید اجباری.
