"use client";

/* eslint-disable @next/next/no-html-link-for-pages -- Full document navigation avoids a Vinext RSC navigation failure between the independent planner and PhD shells. */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, ArrowUpLeft, BookOpen, BriefcaseBusiness, CalendarCheck, Check, ChevronDown,
  CircleDashed, Clock3, Compass, FileText, Filter, GraduationCap, Languages, LayoutDashboard,
  Loader2, Map, MapPin, Plane, Radar, RefreshCw, Search, Sparkles, Target, X,
  Plus,
} from "lucide-react";
import { isValidJalaaliDate, toGregorian } from "jalaali-js";
import type { JourneySuggestion, PositionRecord, PositionSource } from "../../modules/phd/domain/types";
import styles from "./phd.module.css";

type PlannerTask = { id: string; title: string; scheduled_date: string; start_time: string; duration_minutes: number; status: string; area: string };
type Application = { id: string; position_id: string; status: string; next_action: string | null; next_action_date: string | null; title: string; university: string; country: string; overall_score: number };
type CommandCenterData = {
  user: { id: string; username: string; display_name: string } | null;
  profile: Record<string, unknown>;
  positions: PositionRecord[];
  applications: Application[];
  plannerTasks: PlannerTask[];
  sources: PositionSource[];
  suggestions: JourneySuggestion[];
  metrics: { opportunities: number; applications: number; highestMatch: number; upcomingDeadlines: number };
};

const emptyData: CommandCenterData = {
  user: null, profile: {}, positions: [], applications: [], plannerTasks: [], sources: [], suggestions: [],
  metrics: { opportunities: 0, applications: 0, highestMatch: 0, upcomingDeadlines: 0 },
};

export default function PhdCommandCenter({ initialName }: { initialName: string }) {
  const [data, setData] = useState<CommandCenterData>(emptyData);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [query, setQuery] = useState("");
  const [country, setCountry] = useState("all");
  const [funding, setFunding] = useState("all");
  const [selected, setSelected] = useState<PositionRecord | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [deadlineJalali, setDeadlineJalali] = useState("");
  const [manual, setManual] = useState({ title: "", university: "", professor: "", country: "", city: "", researchArea: "", url: "", fundingStatus: "unknown", fundingAmount: "", description: "" });

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/phd/command-center", { cache: "no-store" });
      const payload = await response.json();
      if (response.status === 401) {
        window.location.href = "/";
        return;
      }
      if (!payload.ok) throw new Error(payload.error || "بارگذاری ناموفق بود");
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "بارگذاری ناموفق بود");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const countries = useMemo(() => [...new Set(data.positions.map((position) => position.country))], [data.positions]);
  const filtered = useMemo(() => data.positions.filter((position) => {
    const text = `${position.title} ${position.university} ${position.research_area} ${position.professor || ""}`.toLowerCase();
    return text.includes(query.toLowerCase())
      && (country === "all" || position.country === country)
      && (funding === "all" || position.funding_status === funding);
  }), [country, data.positions, funding, query]);

  function notify(message: string) {
    setToast(message);
    window.setTimeout(() => setToast(""), 3200);
  }

  async function postAction(key: string, body: Record<string, unknown>) {
    setBusy(key);
    try {
      const response = await fetch("/api/phd/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!payload.ok) throw new Error(payload.error || "انجام عملیات ناموفق بود");
      return payload;
    } finally {
      setBusy("");
    }
  }

  async function track(position: PositionRecord) {
    try {
      await postAction(`track-${position.id}`, { action: "track_application", positionId: position.id });
      notify("موقعیت به CRM اپلای اضافه شد");
      setSelected(null);
      await load();
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "ثبت ناموفق بود");
    }
  }

  async function schedulePosition(position: PositionRecord) {
    const date = addDays(todayIso(), 1);
    try {
      const result = await postAction(`plan-${position.id}`, {
        action: "schedule",
        entityType: "position",
        entityId: position.id,
        actionType: "position_review",
        title: `بررسی موقعیت: ${position.title}`,
        notes: `مرور شرایط، استاد و نکات لازم برای اقدام در ${position.university}`,
        scheduledDate: date,
        startTime: "10:00",
        durationMinutes: 45,
        area: "اپلای دکتری",
      });
      notify(result.created ? "این اقدام به تقویم فردا اضافه شد" : "این اقدام قبلاً در تقویم ثبت شده است");
      setSelected(null);
      await load();
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "ثبت در تقویم ناموفق بود");
    }
  }

  async function scheduleSuggestion(item: JourneySuggestion) {
    try {
      const result = await postAction(`suggest-${item.id}`, {
        action: "schedule",
        entityType: "journey",
        entityId: item.id,
        actionType: "weekly_action",
        title: item.title,
        notes: item.description,
        scheduledDate: item.suggestedDate,
        startTime: item.suggestedTime,
        durationMinutes: item.durationMinutes,
        area: plannerArea(item.area),
      });
      notify(result.created ? "به برنامه روزانه اضافه شد" : "این کار قبلاً در برنامه است");
      await load();
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "ثبت ناموفق بود");
    }
  }

  async function addPosition(event: React.FormEvent) {
    event.preventDefault();
    const deadline = deadlineJalali.trim() ? jalaliTextToIso(deadlineJalali) : "";
    if (deadlineJalali.trim() && !deadline) {
      notify("تاریخ ددلاین را شمسی و به شکل ۱۴۰۵/۰۵/۰۶ وارد کن");
      return;
    }
    try {
      await postAction("add-position", { action: "add_position", ...manual, deadline });
      notify("موقعیت اضافه و امتیاز تطابق محاسبه شد");
      setManualOpen(false);
      setDeadlineJalali("");
      setManual({ title: "", university: "", professor: "", country: "", city: "", researchArea: "", url: "", fundingStatus: "unknown", fundingAmount: "", description: "" });
      await load();
    } catch (actionError) {
      notify(actionError instanceof Error ? actionError.message : "افزودن موقعیت ناموفق بود");
    }
  }

  return (
    <main className={styles.shell}>
      <header className={styles.topbar}>
        <a href="/" className={styles.brand} aria-label="بازگشت به روزبانی">
          <span>◆</span><b>روزبانی</b><i>Research Journey</i>
        </a>
        <nav aria-label="ناوبری بخش اپلای">
          <a href="#command"><LayoutDashboard /> فرماندهی</a>
          <a href="#positions"><Radar /> موقعیت‌ها</a>
          <a href="#journey"><Compass /> مسیر من</a>
        </nav>
        <div className={styles.topActions}>
          <button onClick={load} aria-label="بارگذاری دوباره"><RefreshCw className={loading ? styles.spin : ""} /></button>
          <a href="/" className={styles.plannerLink}>برنامه روزانه <ArrowUpLeft /></a>
          <span className={styles.avatar} title={data.user?.username || ""}>{(data.user?.display_name || initialName).slice(0, 1)}</span>
        </div>
      </header>

      <section className={styles.hero} id="command">
        <div className={styles.heroGlow} />
        <div className={styles.heroCopy}>
          <span className={styles.kicker}><Sparkles /> سیستم عامل مسیر پژوهش و مهاجرت</span>
          <h1>از یک ایده پژوهشی،<br /><em>تا یک زندگی تازه.</em></h1>
          <p>موقعیت مناسب را پیدا کن، برای استاد آماده شو، انگلیسی‌ات را جلو ببر و هر اقدام را مستقیم داخل برنامه روزانه‌ات ببین.</p>
          <div className={styles.heroActions}>
            <a href="#positions" className={styles.primary}>دیدن بهترین موقعیت‌ها <ArrowLeft /></a>
            <a href="#journey" className={styles.secondary}>ساخت برنامه این هفته</a>
          </div>
          <div className={styles.sourceStrip}>
            <span>رادار منابع</span>
            {data.sources.slice(0, 5).map((source) => <b key={source.id} className={source.enabled ? styles.sourceLive : ""}>{source.label}</b>)}
          </div>
        </div>
        <div className={styles.orbitCard}>
          <div className={styles.orbitHead}><span><Target /> قطب‌نمای این هفته</span><b>Week 01</b></div>
          <div className={styles.orbitVisual}>
            <div className={styles.ringOuter}><div className={styles.ringMiddle}><strong>{toFa(data.metrics.highestMatch)}٪</strong><span>بهترین تطابق</span></div></div>
            <i className={styles.orbitOne}><BookOpen /></i>
            <i className={styles.orbitTwo}><Languages /></i>
            <i className={styles.orbitThree}><Plane /></i>
          </div>
          <div className={styles.orbitFooter}>
            <div><b>{toFa(data.metrics.opportunities)}</b><span>موقعیت در رادار</span></div>
            <div><b>{toFa(data.metrics.upcomingDeadlines)}</b><span>ددلاین پیش رو</span></div>
            <div><b>{toFa(data.metrics.applications)}</b><span>پرونده فعال</span></div>
          </div>
        </div>
      </section>

      {error && <section className={styles.errorState}><CircleDashed /><div><b>اتصال برقرار نشد</b><span>{error}</span></div><button onClick={load}>تلاش دوباره</button></section>}
      {loading && !error ? <section className={styles.loading}><Loader2 className={styles.spin} /><span>در حال ساختن نقشه مسیرت…</span></section> : !error && <>
        <section className={styles.metricGrid} aria-label="خلاصه مسیر">
          <Metric icon={<Radar />} label="Opportunity radar" value={toFa(data.metrics.opportunities)} note="قرارداد سه منبع تعریف شد" tone="mint" />
          <Metric icon={<BriefcaseBusiness />} label="Application CRM" value={toFa(data.metrics.applications)} note="از shortlist تا offer" tone="blue" />
          <Metric icon={<CalendarCheck />} label="Planner sync" value={toFa(data.plannerTasks.length)} note="اقدام متصل به تقویم" tone="amber" />
          <Metric icon={<Languages />} label="English runway" value="B2 → C1" note="تمرین کوچک، هر روز" tone="violet" />
        </section>

        <section className={styles.section} id="positions">
          <SectionHead
            eyebrow="Position Finder · Milestone 1"
            title="فرصت‌هایی که واقعاً به تو نزدیک‌اند"
            text="فهرست یکپارچه، امتیاز قابل توضیح و اقدام مستقیم؛ بدون گم‌شدن بین ده‌ها تب."
            action={<div className={styles.positionHeaderActions}><span className={styles.demoBadge}>داده‌های شروع برای نمایش جریان کامل</span><button onClick={() => setManualOpen((value) => !value)}><Plus /> افزودن موقعیت</button></div>}
          />
          {manualOpen && <form className={styles.manualForm} onSubmit={addPosition}>
            <header><div><b>افزودن موقعیت از لینک یا منبع شخصی</b><span>امتیاز تطابق بلافاصله محاسبه می‌شود.</span></div><button type="button" onClick={() => setManualOpen(false)} aria-label="بستن"><X /></button></header>
            <div>
              <label>عنوان موقعیت<input required value={manual.title} onChange={(event) => setManual({ ...manual, title: event.target.value })} placeholder="PhD in Medical AI" /></label>
              <label>دانشگاه<input required value={manual.university} onChange={(event) => setManual({ ...manual, university: event.target.value })} placeholder="نام دانشگاه" /></label>
              <label>استاد<input value={manual.professor} onChange={(event) => setManual({ ...manual, professor: event.target.value })} placeholder="اختیاری" /></label>
              <label>کشور<input required value={manual.country} onChange={(event) => setManual({ ...manual, country: event.target.value })} placeholder="Australia" /></label>
              <label>شهر<input value={manual.city} onChange={(event) => setManual({ ...manual, city: event.target.value })} placeholder="اختیاری" /></label>
              <label>حوزه پژوهش<input required value={manual.researchArea} onChange={(event) => setManual({ ...manual, researchArea: event.target.value })} placeholder="Medical Imaging · Computer Vision" /></label>
              <label>ددلاین شمسی<input dir="ltr" inputMode="numeric" value={deadlineJalali} onChange={(event) => setDeadlineJalali(event.target.value)} placeholder="۱۴۰۵/۰۵/۰۶" /></label>
              <label>فاند<select value={manual.fundingStatus} onChange={(event) => setManual({ ...manual, fundingStatus: event.target.value })}><option value="unknown">نامشخص</option><option value="funded">فول فاند</option><option value="partially-funded">فاند جزئی</option><option value="self-funded">شخصی</option></select></label>
              <label className={styles.wideField}>لینک موقعیت<input dir="ltr" type="url" value={manual.url} onChange={(event) => setManual({ ...manual, url: event.target.value })} placeholder="https://…" /></label>
              <label className={styles.wideField}>توضیح کوتاه<textarea value={manual.description} onChange={(event) => setManual({ ...manual, description: event.target.value })} placeholder="شرایط و کلیدواژه‌های مهم…" /></label>
            </div>
            <button className={styles.manualSubmit} disabled={busy === "add-position"}>{busy === "add-position" ? <Loader2 className={styles.spin} /> : <Sparkles />} ذخیره و محاسبه تطابق</button>
          </form>}
          <div className={styles.finderLayout}>
            <aside className={styles.filters}>
              <div className={styles.filterTitle}><Filter /> فیلتر هوشمند</div>
              <label><span>کلیدواژه</span><div><Search /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Medical imaging…" /></div></label>
              <label><span>کشور</span><div><MapPin /><select value={country} onChange={(event) => setCountry(event.target.value)}><option value="all">همه کشورها</option>{countries.map((item) => <option key={item}>{item}</option>)}</select><ChevronDown /></div></label>
              <label><span>نوع فاند</span><div><GraduationCap /><select value={funding} onChange={(event) => setFunding(event.target.value)}><option value="all">همه وضعیت‌ها</option><option value="funded">Fully funded</option><option value="partially-funded">Partially funded</option></select><ChevronDown /></div></label>
              <div className={styles.sourcePanel}>
                <span>Connector readiness</span>
                {data.sources.slice(0, 3).map((source) => <div key={source.id}><i className={source.enabled ? styles.readyDot : ""} /><b>{source.label}</b><small>{source.enabled ? "contract mapped" : "planned"}</small></div>)}
              </div>
            </aside>
            <div className={styles.positionList}>
              <div className={styles.resultBar}><span><b>{toFa(filtered.length)}</b> نتیجه بر اساس پروفایل پژوهشی تو</span><small>مرتب‌سازی: بهترین تطابق</small></div>
              {filtered.map((position, index) => (
                <article className={styles.positionCard} key={position.id}>
                  <button className={styles.positionMain} onClick={() => setSelected(position)}>
                    <span className={styles.rank}>{toFa(index + 1).padStart(2, "۰")}</span>
                    <div className={styles.positionCopy}>
                      <div className={styles.positionMeta}><span><MapPin />{position.city ? `${position.city}, ` : ""}{position.country}</span><span>{position.funding_status === "funded" ? "Fully funded" : position.funding_status}</span>{Boolean(position.is_demo) && <span>نمونه</span>}</div>
                      <h3>{position.title}</h3>
                      <p>{position.university} · {position.professor}</p>
                      <div className={styles.tagRow}>{position.research_area.split("·").map((tag) => <b key={tag}>{tag.trim()}</b>)}</div>
                    </div>
                  </button>
                  <div className={styles.positionAside}>
                    <MatchDial score={position.match.overall} />
                    <span className={styles.deadline}><Clock3 /> {position.deadline ? formatDate(position.deadline) : "ددلاین باز"}</span>
                    <div className={styles.cardActions}>
                      <button onClick={() => setSelected(position)}>چرا این امتیاز؟</button>
                      {position.application_id
                        ? <button className={styles.actionPrimary} onClick={() => schedulePosition(position)} disabled={busy === `plan-${position.id}`}>{busy === `plan-${position.id}` ? <Loader2 className={styles.spin} /> : <CalendarCheck />} افزودن اقدام</button>
                        : <button className={styles.actionPrimary} onClick={() => track(position)} disabled={busy === `track-${position.id}`}>{busy === `track-${position.id}` ? <Loader2 className={styles.spin} /> : <BriefcaseBusiness />} افزودن به CRM</button>}
                    </div>
                  </div>
                </article>
              ))}
              {!filtered.length && <div className={styles.empty}><Radar /><b>نتیجه‌ای پیدا نشد</b><span>فیلترها را کمی بازتر کن.</span></div>}
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.journeySection}`} id="journey">
          <SectionHead eyebrow="Planner Integration" title="چهار مسیر، یک برنامه آرام و قابل انجام" text="هر پیشنهاد با یک کلیک به همان تقویم و فهرست کارهای روزبانی اضافه می‌شود." />
          <div className={styles.journeyGrid}>
            {data.suggestions.map((item) => <JourneyCard key={item.id} item={item} busy={busy === `suggest-${item.id}`} onSchedule={() => scheduleSuggestion(item)} />)}
          </div>
          <div className={styles.planBridge}>
            <div><span className={styles.bridgeIcon}><CalendarCheck /></span><div><b>Planner Bridge</b><p>{data.plannerTasks.length ? `${toFa(data.plannerTasks.length)} اقدام اپلای داخل برنامه روزانه‌ات ثبت شده است.` : "هنوز اقدام اپلای در تقویم نیست؛ از یکی از پیشنهادهای بالا شروع کن."}</p></div></div>
            <div className={styles.bridgeTasks}>{data.plannerTasks.slice(0, 3).map((task) => <span key={task.id}><Check />{task.title}<small>{formatDate(task.scheduled_date)} · {toFa(task.start_time)}</small></span>)}</div>
            <a href="/">باز کردن تقویم روزبانی <ArrowLeft /></a>
          </div>
        </section>

        <section className={styles.pipelineSection}>
          <SectionHead eyebrow="Application CRM" title="هر اپلای، یک داستان قابل پیگیری" text="از کشف موقعیت تا مصاحبه، آفر و مهاجرت؛ بدون فراموشی اقدام بعدی." />
          <div className={styles.pipeline}>
            {["Shortlist", "Preparing", "Contacted", "Applied", "Interview", "Offer"].map((stage, index) => <div key={stage} className={index === 0 ? styles.pipelineActive : ""}><i>{index + 1}</i><b>{stage}</b><span>{stage === "Shortlist" ? toFa(data.applications.filter((application) => application.status === "shortlisted").length) : "۰"}</span></div>)}
          </div>
          <div className={styles.futureBand}>
            <div><Map /><span><b>Built for the whole journey</b><small>Professor analysis · Papers · CV · SOP · Proposal · Email approval · Interview · Scholarship · Visa</small></span></div>
            <span>ماژولار، مرحله‌ای، بدون بازنویسی روزبانی</span>
          </div>
        </section>
      </>}

      {selected && <MatchDrawer position={selected} onClose={() => setSelected(null)} onTrack={() => selected.application_id ? schedulePosition(selected) : track(selected)} busy={busy === `track-${selected.id}` || busy === `plan-${selected.id}`} />}
      {toast && <div className={styles.toast}><Check />{toast}</div>}
    </main>
  );
}

function Metric({ icon, label, value, note, tone }: { icon: React.ReactNode; label: string; value: string; note: string; tone: string }) {
  return <article className={`${styles.metric} ${styles[tone]}`}><span>{icon}</span><div><small>{label}</small><b>{value}</b><em>{note}</em></div></article>;
}

function SectionHead({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return <header className={styles.sectionHead}><div><span>{eyebrow}</span><h2>{title}</h2><p>{text}</p></div>{action}</header>;
}

function MatchDial({ score }: { score: number }) {
  return <div className={styles.matchDial} style={{ "--score": `${score * 3.6}deg` } as React.CSSProperties}><div><b>{toFa(score)}</b><span>Match</span></div></div>;
}

function JourneyCard({ item, busy, onSchedule }: { item: JourneySuggestion; busy: boolean; onSchedule: () => void }) {
  const icon = item.area === "Research" ? <BookOpen /> : item.area === "English" ? <Languages /> : item.area === "Documents" ? <FileText /> : <Plane />;
  return <article className={`${styles.journeyCard} ${styles[`area${item.area}`]}`}><div className={styles.journeyIcon}>{icon}</div><span>{item.area}</span><h3>{item.title}</h3><p>{item.description}</p><div><small><Clock3 />{toFa(item.durationMinutes)} دقیقه · {formatDate(item.suggestedDate)}</small><button onClick={onSchedule} disabled={busy}>{busy ? <Loader2 className={styles.spin} /> : <CalendarCheck />} افزودن</button></div></article>;
}

function MatchDrawer({ position, onClose, onTrack, busy }: { position: PositionRecord; onClose: () => void; onTrack: () => void; busy: boolean }) {
  const scores = [
    ["Research match", position.match.research],
    ["Publication match", position.match.publications],
    ["Skill match", position.match.skills],
    ["Education match", position.match.education],
  ] as const;
  return <div className={styles.drawerBackdrop} onMouseDown={(event) => { if (event.currentTarget === event.target) onClose(); }}>
    <aside className={styles.drawer} aria-modal="true" role="dialog" aria-label="توضیح امتیاز تطابق">
      <button className={styles.drawerClose} onClick={onClose} aria-label="بستن"><X /></button>
      <span className={styles.kicker}><Sparkles /> Explainable Match</span>
      <h2>{position.title}</h2>
      <p className={styles.drawerPlace}>{position.university} · {position.country}</p>
      <div className={styles.drawerScore}><MatchDial score={position.match.overall} /><div><b>تطابق قوی برای بررسی</b><span>این امتیاز یک ابزار تصمیم‌گیری است، نه تضمین پذیرش.</span></div></div>
      <div className={styles.scoreBars}>{scores.map(([label, score]) => <div key={label}><span>{label}<b>{toFa(score)}٪</b></span><i><em style={{ width: `${score}%` }} /></i></div>)}</div>
      <section><h3>چرا این امتیاز؟</h3><p>{position.match.explanation}</p></section>
      <div className={styles.evidenceGrid}><section><h3>نقاط قوت</h3>{position.match.strengths.map((item) => <span key={item}><Check />{item}</span>)}</section><section><h3>شکاف‌هایی که باید ببندی</h3>{position.match.gaps.map((item) => <span key={item}><Target />{item}</span>)}</section></div>
      <button className={styles.drawerAction} onClick={onTrack} disabled={busy}>{busy ? <Loader2 className={styles.spin} /> : position.application_id ? <CalendarCheck /> : <BriefcaseBusiness />}{position.application_id ? "برنامه‌ریزی اقدام بعدی" : "افزودن به CRM اپلای"}</button>
    </aside>
  </div>;
}

function todayIso() {
  const date = new Date();
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return shifted.toISOString().slice(0, 10);
}

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { day: "numeric", month: "short" }).format(new Date(`${iso}T12:00:00`));
}

function toFa(value: string | number) {
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function plannerArea(area: JourneySuggestion["area"]) {
  return ({ Research: "پژوهش", English: "زبان", Documents: "اپلای دکتری", Relocation: "مهاجرت" } as const)[area];
}

function jalaliTextToIso(value: string) {
  const normalized = value.trim().replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[.\-]/g, "/");
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match) return null;
  const [jy, jm, jd] = match.slice(1).map(Number);
  if (!isValidJalaaliDate(jy, jm, jd)) return null;
  const { gy, gm, gd } = toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2, "0")}-${String(gd).padStart(2, "0")}`;
}
