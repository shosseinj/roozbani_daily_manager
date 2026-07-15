"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  Bot,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock3,
  Command,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  ListTodo,
  Loader2,
  LogOut,
  Menu,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Send,
  Settings,
  Sparkles,
  Target,
  Trash2,
  X,
  Zap,
} from "lucide-react";
import {
  isValidJalaaliDate,
  jalaaliMonthLength,
  toGregorian,
  toJalaali,
} from "jalaali-js";
type Task = {
  id: string;
  title: string;
  notes: string | null;
  scheduled_date: string;
  start_time: string;
  duration_minutes: number;
  status: string;
  priority: number;
  energy: string;
  area: string;
  recurring_rule: string;
  created_by_ai: number;
};

type TaskDraft = Omit<Task, "id" | "created_by_ai"> & {
  id?: string;
  created_by_ai?: number;
};
type Profile = { display_name?: string; timezone?: string; day_start?: string; day_end?: string; planning_style?: string };
type Integrations = { openrouter_key_hint?: string | null; openrouter_model?: string; telegram_bot_name?: string | null; telegram_chat_id?: string | null; telegram_webhook_status?: string };
type AuthUser = { id: string; username: string; display_name: string };
type AgentOperation =
  | { type: "create"; title: string; scheduled_date: string; start_time?: string; duration_minutes?: number }
  | { type: "update"; task_id: string; title?: string; scheduled_date?: string; start_time?: string; status?: string }
  | { type: "delete"; task_id: string };
type AgentProposal = { id: string; summary: string; operations: AgentOperation[]; status: "pending" | "applied" | "rejected" | "undone" | "expired"; created_at: string; expires_at: string };
type AgentMessage = { id: string; role: "user" | "assistant"; content: string; created_at: string };
type Page = "today" | "tasks" | "calendar" | "insights" | "settings";
type Scope = "day" | "week" | "month";

const fa = new Intl.NumberFormat("fa-IR");
const areas = ["کار", "برنامه‌ریزی", "مطالعه", "سلامتی", "شخصی", "مالی", "جلسه", "سایر"];
const JALALI_MONTHS = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];


export default function PlannerApp({ initialName }: { initialName: string }) {
  const [page, setPage] = useState<Page>("today");
  const [scope, setScope] = useState<Scope>("day");
  const [selectedDate, setSelectedDate] = useState(todayIso());
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profile, setProfile] = useState<Profile>({ display_name: initialName, timezone: "Asia/Tehran", day_start: "08:00", day_end: "22:00", planning_style: "balanced" });
  const [integrations, setIntegrations] = useState<Integrations>({});
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [busy, setBusy] = useState("");
  const [toast, setToast] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [taskModal, setTaskModal] = useState(false);
  const [editing, setEditing] = useState<TaskDraft | null>(null);
  const [capture, setCapture] = useState("");
  const [proposal, setProposal] = useState<Array<Partial<Task>>>([]);
  const [agentOpen, setAgentOpen] = useState(false);
  const [agentText, setAgentText] = useState("");
  const [agentPrompt, setAgentPrompt] = useState("");
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [agentProposal, setAgentProposal] = useState<AgentProposal | null>(null);
  const [search, setSearch] = useState("");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dashboard", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 401) {
        setNeedsAuth(true);
        return;
      }
      if (!data.ok) throw new Error(data.error);
      setNeedsAuth(false);
      setTasks(data.tasks || []);
      setProfile(data.profile || {});
      setIntegrations(data.integrations || {});
      setUser(data.user || null);
    } catch (error) {
      notify(error instanceof Error ? error.message : "بارگذاری ناموفق بود");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(load, 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        document.getElementById("quick-capture")?.focus();
      }
    };
    addEventListener("keydown", listener);
    return () => removeEventListener("keydown", listener);
  }, []);

  function notify(text: string) {
    setToast(text);
    window.setTimeout(() => setToast(""), 3600);
  }

  const range = useMemo(() => scopeRange(selectedDate, scope), [selectedDate, scope]);
  const visible = useMemo(() => tasks.filter((task) => task.scheduled_date >= range.from && task.scheduled_date <= range.to), [tasks, range]);
  const todayTasks = useMemo(() => tasks.filter((task) => task.scheduled_date === selectedDate && task.status !== "cancelled"), [tasks, selectedDate]);
  const focusTasks = useMemo(
    () =>
      [...todayTasks]
        .filter((task) => task.status !== "done")
        .sort((a, b) => a.priority - b.priority || a.start_time.localeCompare(b.start_time))
        .slice(0, 3),
    [todayTasks],
  );
  const done = visible.filter((task) => task.status === "done").length;
  const completion = visible.length ? Math.round((done / visible.length) * 100) : 0;
  const reminderTasks = useMemo(() => tasks
    .filter((task) => task.status !== "done" && task.status !== "cancelled" && task.scheduled_date <= shiftDays(todayIso(), 7))
    .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date) || a.start_time.localeCompare(b.start_time))
    .slice(0, 8), [tasks]);
  const overdueCount = reminderTasks.filter((task) => task.scheduled_date < todayIso()).length;

  async function mutateTask(id: string, patch: Partial<Task>) {
    if (!id || id === "undefined") {
      notify("شناسه کار معتبر نیست.");
      return;
    }

    setBusy(id);
    const previous = tasks;

    setTasks((rows) =>
      rows.map((task) => (task.id === id ? { ...task, ...patch } : task)),
    );

    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(patch),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "ذخیره ناموفق بود");
      }

      setTasks((rows) =>
        rows.map((task) => (task.id === id ? data.task : task)),
      );
    } catch (error) {
      setTasks(previous);
      notify(error instanceof Error ? error.message : "ذخیره ناموفق بود");
    } finally {
      setBusy("");
    }
  }

  async function deleteTask(id: string) {
    if (!confirm("این کار حذف شود؟")) return;
    const previous = tasks;
    setTasks((rows) => rows.filter((task) => task.id !== id));
    try {
      const res = await fetch(`/api/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || "حذف ناموفق بود");
      notify("کار حذف شد");
    } catch (error) {
      setTasks(previous);
      notify(error instanceof Error ? error.message : "حذف ناموفق بود");
    }
  }

  async function saveTask(payload: Partial<Task>) {
    setBusy("save-task");

    const rawTaskId = typeof editing?.id === "string" ? editing.id.trim() : "";
    const taskId = rawTaskId && rawTaskId !== "undefined" && rawTaskId !== "null" ? rawTaskId : null;
    const isEditing = taskId !== null;

    try {
      const url = taskId ? `/api/tasks/${encodeURIComponent(taskId)}` : "/api/tasks";

      const res = await fetch(url, {
        method: isEditing ? "PATCH" : "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.ok) {
        throw new Error(data.error || "ثبت کار ناموفق بود");
      }

      setTasks((rows) => (isEditing ? rows.map((task) => (task.id === taskId ? data.task : task)) : [...rows, data.task]));

      setTaskModal(false);
      setEditing(null);

      notify(isEditing ? "تغییرات ذخیره شد" : "کار جدید ثبت شد");
    } catch (error) {
      notify(error instanceof Error ? error.message : "ثبت ناموفق بود");
    } finally {
      setBusy("");
    }
  }

  async function smartCapture() {
    if (!capture.trim()) return;
    if (!integrations.openrouter_key_hint) {
      setEditing({ title: capture, scheduled_date: selectedDate, start_time: "09:00", duration_minutes: 30, priority: 2, energy: "medium", area: "سایر", status: "pending", notes: "", recurring_rule: "none" });
      setTaskModal(true);
      return;
    }
    setBusy("capture");
    setProposal([]);
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "capture", input: capture }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setProposal(data.proposal?.tasks || []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "تحلیل متن ناموفق بود");
    } finally {
      setBusy("");
    }
  }

  async function acceptProposals() {
    setBusy("proposal");
    try {
      const created: Task[] = [];
      for (const item of proposal) {
        const res = await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...item, created_by_ai: true }) });
        const data = await res.json();
        if (!data.ok) throw new Error(data.error);
        created.push(data.task);
      }
      setTasks((rows) => [...rows, ...created]);
      setProposal([]);
      setCapture("");
      notify(`${fa.format(created.length)} کار ثبت شد`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "ثبت پیشنهادها ناموفق بود");
    } finally {
      setBusy("");
    }
  }

  async function loadAgentActivity() {
    try {
      const response = await fetch("/api/agent/actions", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) return;
      setAgentMessages(data.messages || []);
      const proposals = (data.proposals || []) as AgentProposal[];
      setAgentProposal(proposals.find((item) => item.status === "pending") || proposals[0] || null);
    } catch {
      // The chat can still work even when history is temporarily unavailable.
    }
  }

  async function runAgent(action: "plan" | "report" | "chat", promptOverride?: string) {
    setAgentOpen(true);
    setBusy("agent");
    setAgentText("");
    const input = (promptOverride ?? agentPrompt).trim();
    if (action === "chat" && input) {
      setAgentMessages((rows) => [...rows, { id: `local-${Date.now()}`, role: "user", content: input, created_at: new Date().toISOString() }]);
    }
    try {
      const res = await fetch("/api/agent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action, input, from: range.from, to: range.to }) });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error);
      setAgentText(data.text);
      setAgentMessages((rows) => [...rows, { id: crypto.randomUUID(), role: "assistant", content: data.text, created_at: new Date().toISOString() }]);
      if (data.proposal) setAgentProposal(data.proposal);
      if (action === "chat") setAgentPrompt("");
    } catch (error) {
      setAgentText(error instanceof Error ? error.message : "پاسخی دریافت نشد");
    } finally {
      setBusy("");
    }
  }

  async function handleAgentProposal(action: "apply" | "reject" | "undo") {
    if (!agentProposal) return;
    setBusy(`proposal-${action}`);
    try {
      const response = await fetch("/api/agent/actions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, proposalId: agentProposal.id }),
      });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "عملیات ناموفق بود");
      setAgentProposal(data.proposal || null);
      if (action === "apply") notify("تغییرات با تأیید شما در برنامه اعمال شد");
      if (action === "reject") notify("پیشنهاد رد شد");
      if (action === "undo") notify("تغییرات با موفقیت بازگردانده شد");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "عملیات ناموفق بود");
    } finally {
      setBusy("");
    }
  }

  function openNewTask(date = selectedDate) {
    setEditing({ scheduled_date: date, start_time: "09:00", duration_minutes: 30, priority: 2, energy: "medium", area: "کار", status: "pending", notes: "", recurring_rule: "none", title: "" });
    setTaskModal(true);
  }
  async function logout() {
    try {
      await fetch("/api/auth", { method: "DELETE" });
    } finally {
      setTasks([]);
      setUser(null);
      setNeedsAuth(true);
      setPage("today");
    }
  }

  function navigate(next: Page) {
    setPage(next);
    setMenuOpen(false);
  }

  if (needsAuth)
    return (
      <LoginGate
        onSuccess={() => {
          setNeedsAuth(false);
          load();
        }}
      />
    );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? "open" : ""}`}>
        <button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="بستن منو">
          <X />
        </button>
        <div className="brand">
          <span className="brand-leaf">◆</span>
          <strong>روزبانی</strong>
          <small>عامل هوشمند روزهای تو</small>
        </div>
        <nav className="nav-list" aria-label="منوی اصلی">
          <Nav active={page === "today"} icon={<LayoutDashboard />} label="امروز" onClick={() => navigate("today")} />
          <Nav active={page === "tasks"} icon={<ListTodo />} label="کارها" onClick={() => navigate("tasks")} count={tasks.filter((t) => t.status !== "done").length} />
          <Nav active={page === "calendar"} icon={<CalendarDays />} label="تقویم" onClick={() => navigate("calendar")} />
          <Nav active={page === "insights"} icon={<BarChart3 />} label="مرور و گزارش" onClick={() => navigate("insights")} />
          <a href="/phd" className="nav-phd"><GraduationCap /><span>مسیر اپلای دکتری</span><b>جدید</b></a>
          <Nav active={page === "settings"} icon={<Settings />} label="تنظیمات" onClick={() => navigate("settings")} />
        </nav>
        <div className="sidebar-quote">
          <span className="sprout">⌁</span>
          <p>
            تمرکزهای کوچک،
            <br />
            روزهای بزرگ می‌سازند.
          </p>
        </div>
        <div className="connection-row">
          <span className={integrations.openrouter_key_hint ? "status-dot online" : "status-dot"} />
          {integrations.openrouter_key_hint ? "عامل هوشمند آماده است" : "OpenRouter متصل نیست"}
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <button className="menu-button" onClick={() => setMenuOpen(true)} aria-label="باز کردن منو">
            <Menu />
          </button>
          <div className="date-control">
            <button onClick={() => setSelectedDate(todayIso())}>امروز</button>
            <JalaliDateInput key={selectedDate} value={selectedDate} onChange={setSelectedDate} />
            <span>{longPersianDate(selectedDate)}</span>
          </div>
          <div className="top-actions">
            <button aria-label="اعلان‌ها" className="notification-button" onClick={() => setNotificationsOpen((value) => !value)}>
              <Bell />
              {reminderTasks.length > 0 && <i>{fa.format(reminderTasks.length)}</i>}
            </button>
            {notificationsOpen && (
              <div className="notification-center">
                <div className="notification-head">
                  <span><Bell /> یادآورها</span>
                  <b>{overdueCount ? `${fa.format(overdueCount)} عقب‌افتاده` : "همه‌چیز مرتب است"}</b>
                </div>
                {reminderTasks.length ? reminderTasks.map((task) => (
                  <button key={task.id} onClick={() => { setSelectedDate(task.scheduled_date); setPage("today"); setNotificationsOpen(false); }}>
                    <i className={task.scheduled_date < todayIso() ? "overdue" : "upcoming"} />
                    <span><b>{task.title}</b><small>{shortPersianDate(task.scheduled_date)} · {toFaDigits(task.start_time)}</small></span>
                    <ChevronLeft />
                  </button>
                )) : <Empty title="یادآوری نزدیکی نیست" text="کارهای هفت روز آینده اینجا نمایش داده می‌شوند." />}
              </div>
            )}
            <button aria-label="بارگذاری دوباره" onClick={load}>
              <RefreshCw className={loading ? "spin" : ""} />
            </button>
            <button className="logout-button" type="button" onClick={logout} aria-label="خروج از حساب" title="خروج">
              <LogOut />
            </button>
            <div className="avatar" title={user?.username || ""}>{(profile.display_name || user?.display_name || initialName).slice(0, 1)}</div>
          </div>
        </header>

        {loading ? (
          <Loading />
        ) : (
          <div className="content">
            {page === "today" && (
              <TodayView
                name={profile.display_name || initialName}
                selectedDate={selectedDate}
                focusTasks={focusTasks}
                todayTasks={todayTasks}
                allTasks={tasks}
                completion={completion}
                capture={capture}
                setCapture={setCapture}
                smartCapture={smartCapture}
                busy={busy}
                proposal={proposal}
                acceptProposals={acceptProposals}
                clearProposal={() => setProposal([])}
                mutateTask={mutateTask}
                editTask={(task) => {
                  setEditing(task);
                  setTaskModal(true);
                }}
                openNewTask={() => openNewTask()}
                runPlan={() => runAgent("plan")}
              />
            )}
            {page === "tasks" && (
              <TasksView
                tasks={visible}
                scope={scope}
                setScope={setScope}
                search={search}
                setSearch={setSearch}
                selectedDate={selectedDate}
                mutateTask={mutateTask}
                editTask={(task) => {
                  setEditing(task);
                  setTaskModal(true);
                }}
                deleteTask={deleteTask}
                openNewTask={() => openNewTask()}
              />
            )}
            {page === "calendar" && <CalendarView date={selectedDate} setDate={setSelectedDate} tasks={tasks} openNewTask={openNewTask} />}
            {page === "insights" && <InsightsView tasks={visible} scope={scope} setScope={setScope} completion={completion} runReport={() => runAgent("report")} />}
            {page === "settings" && <SettingsView profile={profile} setProfile={setProfile} integrations={integrations} refresh={load} notify={notify} />}
          </div>
        )}
      </main>

      <button
        className="floating-agent"
        onClick={() => {
          setAgentOpen(true);
          setAgentText("");
          void loadAgentActivity();
        }}
      >
        <Sparkles /> گفت‌وگو با روزبانی
      </button>
      {taskModal && editing && (
        <TaskModal
          task={editing}
          onClose={() => {
            setTaskModal(false);
            setEditing(null);
          }}
          onSave={saveTask}
          busy={busy === "save-task"}
        />
      )}
      {agentOpen && (
        <AgentPanel
          connected={Boolean(integrations.openrouter_key_hint)}
          text={agentText}
          messages={agentMessages}
          proposal={agentProposal}
          prompt={agentPrompt}
          setPrompt={setAgentPrompt}
          busy={busy === "agent"}
          onSend={() => runAgent("chat")}
          onQuick={(value) => runAgent("chat", value)}
          onPlan={() => runAgent("plan")}
          onProposalAction={handleAgentProposal}
          proposalBusy={busy.startsWith("proposal-")}
          onClose={() => setAgentOpen(false)}
        />
      )}
      {toast && (
        <div className="toast">
          <Check />
          {toast}
        </div>
      )}
      {menuOpen && <button className="overlay" aria-label="بستن" onClick={() => setMenuOpen(false)} />}
    </div>
  );
}


function JalaliDateInput({
  value,
  onChange,
  required = false,
}: {
  value: string;
  onChange: (isoDate: string) => void;
  required?: boolean;
}) {
  const [text, setText] = useState(() => isoToJalaliText(value));
  const [invalid, setInvalid] = useState(false);

  function applyDate(rawValue: string) {
    const isoDate = jalaliTextToIso(rawValue);

    if (!isoDate) {
      setInvalid(true);
      return false;
    }

    setInvalid(false);
    setText(isoToJalaliText(isoDate));
    onChange(isoDate);
    return true;
  }

  return (
    <div className="jalali-date-field">
      <input
        type="text"
        inputMode="numeric"
        dir="ltr"
        value={text}
        required={required}
        aria-invalid={invalid}
        placeholder="۱۴۰۵/۰۵/۰۶"
        className={invalid ? "invalid" : ""}
        onChange={(event) => {
          const nextValue = event.target.value;
          setText(nextValue);
          setInvalid(false);

          const isoDate = jalaliTextToIso(nextValue);
          if (isoDate) onChange(isoDate);
        }}
        onBlur={() => {
          if (!applyDate(text)) {
            setText(isoToJalaliText(value));
          }
        }}
      />
      {invalid && (
        <small className="field-error">
          تاریخ شمسی معتبر وارد کنید؛ مثال: ۱۴۰۵/۰۵/۰۶
        </small>
      )}
    </div>
  );
}

function Nav({ active, icon, label, onClick, count }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void; count?: number }) {
  return (
    <button className={active ? "active" : ""} onClick={onClick}>
      {icon}
      <span>{label}</span>
      {typeof count === "number" && count > 0 && <b>{fa.format(count)}</b>}
    </button>
  );
}

function TodayView(props: {
  name: string;
  selectedDate: string;
  focusTasks: Task[];
  todayTasks: Task[];
  allTasks: Task[];
  completion: number;
  capture: string;
  setCapture: (v: string) => void;
  smartCapture: () => void;
  busy: string;
  proposal: Array<Partial<Task>>;
  acceptProposals: () => void;
  clearProposal: () => void;
  mutateTask: (id: string, patch: Partial<Task>) => void;
  editTask: (task: Task) => void;
  openNewTask: () => void;
  runPlan: () => void;
}) {
  const week = weekDays(props.selectedDate);
  return (
    <>
      <section className="hero-row">
        <div>
          <span className="eyebrow">{isToday(props.selectedDate) ? "برنامه‌ی امروز" : shortPersianDate(props.selectedDate)}</span>
          <h1>
            صبح بخیر {props.name}،<br />
            <em>امروز را با تمرکز شروع کن.</em>
          </h1>
          <p>
            {props.todayTasks.length ? `${fa.format(props.todayTasks.length)} کار در برنامه داری؛ ${fa.format(props.todayTasks.reduce((sum, t) => sum + t.duration_minutes, 0))} دقیقه زمان متمرکز.` : "امروز هنوز خلوت است؛ اولین تمرکزت را اضافه کن."}
          </p>
        </div>
        <button className="ai-plan-button" onClick={props.runPlan}>
          <Sparkles />
          <span>
            <small>روزبانی آماده است</small>برنامه‌ریزی با هوش مصنوعی
          </span>
          <ChevronLeft />
        </button>
      </section>

      <section className="dashboard-grid">
        <article className="card focus-card">
          <CardTitle
            icon={<Target />}
            title="تمرکز امروز"
            meta={`${fa.format(props.focusTasks.length)} اولویت اصلی`}
            action={
              <button className="icon-action" onClick={props.openNewTask}>
                <Plus />
              </button>
            }
          />
          <div className="focus-list">
            {props.focusTasks.length ? (
              props.focusTasks.map((task) => <TaskRow key={task.id} task={task} onDone={() => props.mutateTask(task.id, { status: "done" })} onEdit={() => props.editTask(task)} busy={props.busy === task.id} />)
            ) : (
              <Empty title="همه‌چیز انجام شده" text="برای امروز تمرکز جدیدی اضافه کن یا کمی استراحت کن." />
            )}
          </div>
        </article>
        <article className="card timeline-card">
          <CardTitle icon={<CalendarDays />} title="برنامه‌ی امروز" meta={shortPersianDate(props.selectedDate)} />
          <div className="timeline">
            {props.todayTasks
              .slice()
              .sort((a, b) => a.start_time.localeCompare(b.start_time))
              .map((task, index) => (
                <button key={task.id} className={task.status === "done" ? "done" : ""} onClick={() => props.editTask(task)}>
                  <time>{toFaDigits(task.start_time)}</time>
                  <i className={index === 0 ? "current" : ""} />
                  <span>
                    <b>{task.title}</b>
                    <small>
                      {fa.format(task.duration_minutes)} دقیقه · {task.area}
                    </small>
                  </span>
                </button>
              ))}
            {!props.todayTasks.length && <Empty title="برنامه خالی است" text="زمان دلخواهت را با یک کار پر کن." />}
          </div>
        </article>
        <article className="card capture-card">
          <CardTitle icon={<Inbox />} title="یادداشت سریع" meta="با زبان طبیعی بنویس" />
          <div className="capture-box">
            <textarea
              id="quick-capture"
              value={props.capture}
              onChange={(e) => props.setCapture(e.target.value)}
              placeholder="مثلاً فردا ساعت ۱۰، ۴۵ دقیقه گزارش فروش را کامل کنم…"
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") props.smartCapture();
              }}
            />
            <button onClick={props.smartCapture} disabled={props.busy === "capture"}>
              {props.busy === "capture" ? <Loader2 className="spin" /> : <Sparkles />}
              {props.busy === "capture" ? "در حال تحلیل" : "تبدیل به کار"}
            </button>
            <kbd>Ctrl + Enter</kbd>
          </div>
          {props.proposal.length > 0 && (
            <div className="proposal">
              <div className="proposal-head">
                <b>پیشنهاد روزبانی</b>
                <button onClick={props.clearProposal}>
                  <X />
                </button>
              </div>
              {props.proposal.map((item, i) => (
                <div className="proposal-item" key={i}>
                  <span>{item.title}</span>
                  <small>
                    {item.scheduled_date ? shortPersianDate(item.scheduled_date) : "بدون تاریخ"} · {item.start_time ? toFaDigits(item.start_time) : "بدون ساعت"} · {fa.format(item.duration_minutes || 30)} دقیقه
                  </small>
                </div>
              ))}
              <button className="primary wide" onClick={props.acceptProposals} disabled={props.busy === "proposal"}>
                {props.busy === "proposal" ? "در حال ثبت…" : "تأیید و ثبت همه"}
              </button>
            </div>
          )}
        </article>
        <article className="card progress-card">
          <CardTitle icon={<BarChart3 />} title="پیشرفت این هفته" meta={`${fa.format(props.allTasks.filter((t) => week.includes(t.scheduled_date) && t.status === "done").length)} کار انجام شده`} />
          <div className="progress-body">
            <div className="week-dots">
              {week.map((date) => {
                const day = props.allTasks.filter((t) => t.scheduled_date === date);
                const complete = day.length > 0 && day.every((t) => t.status === "done");
                return (
                  <div key={date}>
                    <span>{weekday(date)}</span>
                    <i className={complete ? "complete" : isToday(date) ? "today" : ""}>{complete ? <Check /> : day.length ? fa.format(day.length) : ""}</i>
                  </div>
                );
              })}
            </div>
            <div className="ring" style={{ "--value": `${props.completion * 3.6}deg` } as React.CSSProperties}>
              <strong>{fa.format(props.completion)}٪</strong>
              <span>نرخ انجام</span>
            </div>
          </div>
        </article>
      </section>
    </>
  );
}

function TaskRow({ task, onDone, onEdit, busy }: { task: Task; onDone: () => void; onEdit: () => void; busy: boolean }) {
  return (
    <div className="focus-row">
      <button className="check-button" onClick={onDone} aria-label="انجام شد">
        {busy ? <Loader2 className="spin" /> : <Circle />}
      </button>
      <button className="task-main" onClick={onEdit}>
        <b>{task.title}</b>
        <span>
          <Clock3 />
          {fa.format(task.duration_minutes)} دقیقه <i>{task.area}</i>
        </span>
      </button>
      <span className={`priority p${task.priority}`}>اولویت {fa.format(task.priority)}</span>
      <ChevronLeft />
    </div>
  );
}

function TasksView({
  tasks,
  scope,
  setScope,
  search,
  setSearch,
  mutateTask,
  editTask,
  deleteTask,
  openNewTask,
}: {
  tasks: Task[];
  scope: Scope;
  setScope: (v: Scope) => void;
  search: string;
  setSearch: (v: string) => void;
  selectedDate: string;
  mutateTask: (id: string, patch: Partial<Task>) => void;
  editTask: (t: Task) => void;
  deleteTask: (id: string) => void;
  openNewTask: () => void;
}) {
  const normalizedSearch = search.trim().toLowerCase();
  const filtered = tasks.filter((task) =>
    `${task.title} ${task.area} ${task.notes || ""}`
      .toLowerCase()
      .includes(normalizedSearch),
  );

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="مدیریت کارها"
        title="همه‌چیز، در جای درست خودش."
        text="کارها را برای روز، هفته یا ماه ببین و بدون اصطکاک به‌روزشان کن."
        action={
          <button className="primary" type="button" onClick={openNewTask}>
            <Plus /> کار جدید
          </button>
        }
      />

      <div className="filterbar">
        <ScopeTabs scope={scope} setScope={setScope} />
        <label className="searchbox">
          <Search />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="جست‌وجوی کارها…"
          />
        </label>
      </div>

      <div className="planner-task-table card">
        <div className="planner-task-head">
          <span aria-hidden="true" />
          <span>کار</span>
          <span>زمان</span>
          <span>دسته</span>
          <span>وضعیت</span>
          <span aria-hidden="true" />
        </div>

        {filtered.length ? (
          filtered.map((task) => (
            <div
              className={`planner-task-row ${task.status === "done" ? "is-completed" : ""}`}
              key={task.id}
            >
              <button
                type="button"
                className="planner-task-check"
                onClick={() =>
                  mutateTask(task.id, {
                    status: task.status === "done" ? "pending" : "done",
                  })
                }
                aria-label={task.status === "done" ? "بازگرداندن کار" : "علامت‌گذاری به‌عنوان انجام‌شده"}
              >
                {task.status === "done" && <Check />}
              </button>

              <div className="planner-task-info">
                <b>{task.title}</b>
                <small>
                  {task.notes || (task.created_by_ai ? "پیشنهاد هوش مصنوعی" : "بدون توضیح")}
                </small>
              </div>

              <div className="planner-task-date">
                <b>{shortPersianDate(task.scheduled_date)}</b>
                <small>
                  {toFaDigits(task.start_time)} · {fa.format(task.duration_minutes)} دقیقه
                </small>
              </div>

              <span className="planner-area-pill">{task.area}</span>
              <span className={`planner-status-pill ${task.status}`}>
                {statusLabel(task.status)}
              </span>

              <div className="planner-task-actions">
                <button type="button" onClick={() => editTask(task)} aria-label="ویرایش">
                  <Pencil />
                </button>
                <button type="button" onClick={() => deleteTask(task.id)} aria-label="حذف">
                  <Trash2 />
                </button>
              </div>
            </div>
          ))
        ) : (
          <Empty title="کاری پیدا نشد" text="فیلتر را تغییر بده یا یک کار جدید بساز." />
        )}
      </div>
    </section>
  );
}

function CalendarView({ date, setDate, tasks, openNewTask }: { date: string; setDate: (v: string) => void; tasks: Task[]; openNewTask: (date: string) => void }) {
  const days = calendarDays(date);
  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="تقویم"
        title={monthTitle(date)}
        text="تصویر ماه را ببین؛ روزهای سنگین را متعادل و زمان‌های خالی را آگاهانه حفظ کن."
        action={
          <div className="month-nav">
            <button onClick={() => setDate(shiftMonth(date, -1))}>
              <ChevronRight />
            </button>
            <button onClick={() => setDate(todayIso())}>امروز</button>
            <button onClick={() => setDate(shiftMonth(date, 1))}>
              <ChevronLeft />
            </button>
          </div>
        }
      />
      <div className="calendar card">
        <div className="calendar-weekdays">
          {["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"].map((day) => (
            <span key={day}>{day}</span>
          ))}
        </div>
        <div className="calendar-grid">
          {days.map((item) => {
            const dayTasks = tasks.filter((task) => task.scheduled_date === item.iso && task.status !== "deleted");
            return (
              <button
                key={item.iso}
                className={`${item.current ? "" : "muted"} ${item.iso === date ? "selected" : ""} ${isToday(item.iso) ? "today" : ""}`}
                onClick={() => {
                  setDate(item.iso);
                  openNewTask(item.iso);
                }}
              >
                <time>{fa.format(item.day)}</time>
                <div>
                  {dayTasks.slice(0, 3).map((task) => (
                    <span key={task.id} className={task.status === "done" ? "done" : ""}>
                      {task.title}
                    </span>
                  ))}
                </div>
                {dayTasks.length > 3 && <small>+{fa.format(dayTasks.length - 3)} کار دیگر</small>}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function InsightsView({ tasks, scope, setScope, completion, runReport }: { tasks: Task[]; scope: Scope; setScope: (v: Scope) => void; completion: number; runReport: () => void }) {
  const planned = tasks.reduce((sum, task) => sum + task.duration_minutes, 0);
  const doneTime = tasks.filter((task) => task.status === "done").reduce((sum, task) => sum + task.duration_minutes, 0);
  const byArea = Object.entries(
    tasks.reduce<Record<string, number>>((acc, task) => {
      acc[task.area] = (acc[task.area] || 0) + task.duration_minutes;
      return acc;
    }, {}),
  ).sort((a, b) => b[1] - a[1]);
  const max = Math.max(...byArea.map((x) => x[1]), 1);
  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="مرور عملکرد"
        title="آمارهایی که به تصمیم بهتر می‌رسند."
        text="نه فقط تعداد کارها؛ الگوی زمان، تمرکز و ظرفیت واقعی خودت را ببین."
        action={
          <button className="primary" onClick={runReport}>
            <Sparkles /> تحلیل با روزبانی
          </button>
        }
      />
      <div className="filterbar">
        <ScopeTabs scope={scope} setScope={setScope} />
      </div>
      <div className="metrics-row">
        <Metric icon={<Target />} label="نرخ انجام" value={`${fa.format(completion)}٪`} note={`${fa.format(tasks.filter((t) => t.status === "done").length)} از ${fa.format(tasks.length)} کار`} />
        <Metric icon={<Clock3 />} label="زمان برنامه‌ریزی‌شده" value={`${fa.format(Math.round((planned / 60) * 10) / 10)} ساعت`} note={`${fa.format(doneTime)} دقیقه انجام‌شده`} />
        <Metric icon={<Zap />} label="کارهای مهم" value={fa.format(tasks.filter((t) => t.priority === 1).length)} note="اولویت سطح یک" />
      </div>
      <div className="insight-grid">
        <article className="card">
          <CardTitle icon={<BarChart3 />} title="توزیع زمان" meta="براساس حوزه" />
          <div className="bars">
            {byArea.length ? (
              byArea.map(([area, value]) => (
                <div key={area}>
                  <span>{area}</span>
                  <i>
                    <b style={{ width: `${(value / max) * 100}%` }} />
                  </i>
                  <em>{fa.format(value)} دقیقه</em>
                </div>
              ))
            ) : (
              <Empty title="هنوز داده‌ای نیست" text="پس از ثبت چند کار، الگوها اینجا دیده می‌شوند." />
            )}
          </div>
        </article>
        <article className="card insight-note">
          <Sparkles />
          <h3>یک مشاهده‌ی کوتاه</h3>
          <p>
            {completion >= 75
              ? "ریتمت پایدار است. برای حفظ آن، ظرفیت خالی بین کارهای مهم را قربانی نکن."
              : completion >= 40
                ? "برنامه در مسیر است؛ بهتر است فردا فقط سه اولویت اصلی انتخاب کنی."
                : "حجم برنامه شاید بیشتر از ظرفیت واقعی باشد. کارها را کوچک‌تر و مشخص‌تر کن."}
          </p>
          <button onClick={runReport}>
            گزارش کامل هوشمند <ChevronLeft />
          </button>
        </article>
      </div>
    </section>
  );
}

function SettingsView({
  profile,
  setProfile,
  integrations,
  refresh,
  notify,
}: {
  profile: Profile;
  setProfile: (v: Profile) => void;
  integrations: Integrations;
  refresh: () => void | Promise<void>;
  notify: (s: string) => void;
}) {
  const [openrouterKey, setOpenrouterKey] = useState("");
  const [model, setModel] = useState(integrations.openrouter_model || "openrouter/free");
  const [telegramToken, setTelegramToken] = useState("");
  const [busy, setBusy] = useState("");

  async function save(action: string, extra: Record<string, unknown>) {
    setBusy(action);

    try {
      const response = await fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        warning?: string | null;
      } | null;

      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `ذخیره تنظیمات ناموفق بود (${response.status})`);
      }

      if (action === "save_openrouter") {
        notify(
          data.warning
            ? `کلید ذخیره شد. ${data.warning}`
            : "اتصال OpenRouter بررسی و کلید ذخیره شد.",
        );
      } else {
        notify("تنظیمات با موفقیت ذخیره شد");
      }

      setOpenrouterKey("");
      setTelegramToken("");
      await refresh();
    } catch (error) {
      notify(error instanceof Error ? error.message : "ذخیره ناموفق بود");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="workspace-page">
      <PageHeader
        eyebrow="تنظیمات"
        title="اتصال‌ها و سبک برنامه‌ریزی."
        text="کلیدها در مرورگر نگه‌داری نمی‌شوند؛ پس از رمزنگاری در فضای ابری ذخیره می‌شوند."
      />

      <div className="settings-grid">
        <article className="card integration-card">
          <div className="integration-logo openrouter">
            <Command />
          </div>

          <div className="integration-title">
            <div>
              <h3>OpenRouter</h3>
              <p>مغز هوشمند برای برنامه‌ریزی، ثبت طبیعی و گزارش‌ها</p>
            </div>
            <span className={integrations.openrouter_key_hint ? "connected" : "disconnected"}>
              {integrations.openrouter_key_hint ? "متصل" : "متصل نیست"}
            </span>
          </div>

          {integrations.openrouter_key_hint && (
            <div className="connection-detail">
              <b>{integrations.openrouter_key_hint}</b>
              <span>{integrations.openrouter_model}</span>
            </div>
          )}

          <label>
            کلید API
            <input
              type="password"
              value={openrouterKey}
              onChange={(event) => setOpenrouterKey(event.target.value)}
              placeholder="sk-or-v1-…"
              autoComplete="new-password"
              spellCheck={false}
              dir="ltr"
            />
          </label>

          <label>
            مدل
            <input
              value={model}
              onChange={(event) => setModel(event.target.value)}
              placeholder="openrouter/free"
              autoComplete="off"
              spellCheck={false}
              dir="ltr"
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="primary"
              disabled={!openrouterKey.trim() || busy === "save_openrouter"}
              onClick={() =>
                save("save_openrouter", {
                  key: openrouterKey.trim(),
                  model: model.trim() || "openrouter/free",
                })
              }
            >
              {busy === "save_openrouter" ? <Loader2 className="spin" /> : <Sparkles />}
              {busy === "save_openrouter" ? "در حال بررسی…" : "ذخیره و اتصال"}
            </button>

            {integrations.openrouter_key_hint && (
              <button
                type="button"
                className="danger-link"
                disabled={busy === "disconnect_openrouter"}
                onClick={() => save("disconnect_openrouter", {})}
              >
                قطع اتصال
              </button>
            )}
          </div>
        </article>

        <article className="card integration-card">
          <div className="integration-logo telegram">
            <Send />
          </div>

          <div className="integration-title">
            <div>
              <h3>ربات تلگرام</h3>
              <p>توکن را همین‌جا وارد کن؛ نیازی به دسترسی مستقیم به تلگرام نیست</p>
            </div>
            <span className={integrations.telegram_webhook_status === "connected" ? "connected" : "disconnected"}>
              {integrations.telegram_webhook_status === "connected" ? "فعال" : "غیرفعال"}
            </span>
          </div>

          {integrations.telegram_bot_name && (
            <div className="connection-detail">
              <b>@{integrations.telegram_bot_name}</b>
              <span>
                {integrations.telegram_chat_id
                  ? "گفت‌وگو شناسایی شده"
                  : "پس از اتصال، برای ربات /start بفرست"}
              </span>
            </div>
          )}

          <label>
            Bot Token
            <input
              type="password"
              value={telegramToken}
              onChange={(event) => setTelegramToken(event.target.value)}
              placeholder="123456789:AA…"
              autoComplete="new-password"
              spellCheck={false}
              dir="ltr"
            />
          </label>

          <div className="form-actions">
            <button
              type="button"
              className="primary"
              disabled={!telegramToken.trim() || busy === "connect_telegram"}
              onClick={() => save("connect_telegram", { token: telegramToken.trim() })}
            >
              {busy === "connect_telegram" ? <Loader2 className="spin" /> : <Send />}
              بررسی و فعال‌سازی
            </button>

            {integrations.telegram_webhook_status === "connected" && (
              <button
                type="button"
                className="danger-link"
                disabled={busy === "disconnect_telegram"}
                onClick={() => save("disconnect_telegram", {})}
              >
                قطع اتصال
              </button>
            )}
          </div>

          <div className="security-note">
            <Bell /> پس از اتصال، دستورات /today، /week و /month فعال‌اند و پیام طبیعی به کار تبدیل می‌شود.
          </div>
        </article>

        <article className="card preferences">
          <CardTitle icon={<Settings />} title="ترجیحات برنامه‌ریزی" meta="قابل تغییر در هر زمان" />

          <div className="form-grid">
            <label>
              نام نمایشی
              <input
                value={profile.display_name || ""}
                onChange={(event) => setProfile({ ...profile, display_name: event.target.value })}
              />
            </label>

            <label>
              منطقه زمانی
              <select
                value={profile.timezone || "Asia/Tehran"}
                onChange={(event) => setProfile({ ...profile, timezone: event.target.value })}
              >
                <option value="Asia/Tehran">تهران</option>
                <option value="Asia/Baku">باکو</option>
                <option value="UTC">UTC</option>
              </select>
            </label>

            <label>
              شروع روز
              <input
                type="time"
                value={profile.day_start || "08:00"}
                onChange={(event) => setProfile({ ...profile, day_start: event.target.value })}
              />
            </label>

            <label>
              پایان روز
              <input
                type="time"
                value={profile.day_end || "22:00"}
                onChange={(event) => setProfile({ ...profile, day_end: event.target.value })}
              />
            </label>

            <label>
              سبک برنامه‌ریزی
              <select
                value={profile.planning_style || "balanced"}
                onChange={(event) => setProfile({ ...profile, planning_style: event.target.value })}
              >
                <option value="gentle">آرام و منعطف</option>
                <option value="balanced">متعادل</option>
                <option value="focused">متمرکز و فشرده</option>
              </select>
            </label>
          </div>

          <button type="button" className="primary" onClick={() => save("profile", profile)}>
            ذخیره ترجیحات
          </button>
        </article>
      </div>
    </section>
  );
}

function TaskModal({
  task,
  onClose,
  onSave,
  busy,
}: {
  task: TaskDraft;
  onClose: () => void;
  onSave: (value: Partial<Task>) => void;
  busy: boolean;
}) {
  const [form, setForm] = useState(task);

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="task-modal-title">
      <form
        className="modal card"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(form);
        }}
      >
        <div className="modal-head">
          <div>
            <span>برنامه‌ریزی کار</span>
            <h2 id="task-modal-title">{task.id ? "ویرایش کار" : "کار جدید"}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="بستن">
            <X />
          </button>
        </div>

        <label>
          عنوان کار
          <input
            autoFocus
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder="دقیق و قابل انجام بنویس"
            required
          />
        </label>

        <label>
          توضیح کوتاه
          <textarea
            value={form.notes || ""}
            onChange={(event) => setForm({ ...form, notes: event.target.value })}
            placeholder="نتیجه مورد انتظار یا نکته مهم…"
          />
        </label>

        <div className="form-grid">
          <label>
            تاریخ
            <JalaliDatePicker
              value={form.scheduled_date}
              onChange={(scheduledDate) => setForm({ ...form, scheduled_date: scheduledDate })}
            />
          </label>

          <label>
            ساعت
            <input
              type="time"
              value={form.start_time}
              onChange={(event) => setForm({ ...form, start_time: event.target.value })}
              required
            />
          </label>

          <label>
            مدت (دقیقه)
            <input
              type="number"
              min="5"
              max="720"
              step="5"
              value={form.duration_minutes}
              onChange={(event) => setForm({ ...form, duration_minutes: Number(event.target.value) })}
              required
            />
          </label>

          <label>
            دسته
            <select
              value={form.area}
              onChange={(event) => setForm({ ...form, area: event.target.value })}
            >
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </label>

          <label>
            اولویت
            <select
              value={form.priority}
              onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
            >
              <option value={1}>۱ — مهم</option>
              <option value={2}>۲ — متوسط</option>
              <option value={3}>۳ — عادی</option>
            </select>
          </label>

          <label>
            انرژی
            <select
              value={form.energy}
              onChange={(event) => setForm({ ...form, energy: event.target.value })}
            >
              <option value="high">زیاد</option>
              <option value="medium">متوسط</option>
              <option value="low">کم</option>
            </select>
          </label>
        </div>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            انصراف
          </button>
          <button type="submit" className="primary" disabled={busy}>
            {busy ? <Loader2 className="spin" /> : <Check />} ذخیره کار
          </button>
        </div>
      </form>
    </div>
  );
}

const JALALI_WEEKDAYS = ["ش", "ی", "د", "س", "چ", "پ", "ج"];

function JalaliDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (isoDate: string) => void;
}) {
  const selected = isoToJalaliParts(value) || isoToJalaliParts(todayIso());
  const [open, setOpen] = useState(false);
  const [viewYear, setViewYear] = useState(selected?.jy || 1405);
  const [viewMonth, setViewMonth] = useState(selected?.jm || 1);

  const days = useMemo(
    () => createJalaliPickerDays(viewYear, viewMonth),
    [viewYear, viewMonth],
  );

  function changeMonth(amount: number) {
    const absoluteMonth = viewYear * 12 + (viewMonth - 1) + amount;
    setViewYear(Math.floor(absoluteMonth / 12));
    setViewMonth(((absoluteMonth % 12) + 12) % 12 + 1);
  }

  function openPicker() {
    const current = isoToJalaliParts(value) || isoToJalaliParts(todayIso());
    if (current) {
      setViewYear(current.jy);
      setViewMonth(current.jm);
    }
    setOpen(true);
  }

  return (
    <div className="jalali-datepicker">
      <input type="hidden" name="scheduled_date" value={value} required readOnly />
      <button
        type="button"
        className="jalali-datepicker-trigger"
        onClick={() => (open ? setOpen(false) : openPicker())}
        aria-expanded={open}
      >
        <CalendarDays />
        <span>{isoToJalaliText(value) || "انتخاب تاریخ"}</span>
      </button>

      {open && (
        <div className="jalali-calendar-popup">
          <div className="jalali-calendar-header">
            <button type="button" onClick={() => changeMonth(-1)} aria-label="ماه قبل">
              <ChevronRight />
            </button>
            <strong>
              {JALALI_MONTHS[viewMonth - 1]} {fa.format(viewYear)}
            </strong>
            <button type="button" onClick={() => changeMonth(1)} aria-label="ماه بعد">
              <ChevronLeft />
            </button>
          </div>

          <div className="jalali-calendar-weekdays">
            {JALALI_WEEKDAYS.map((weekday, index) => (
              <span key={`${weekday}-${index}`}>{weekday}</span>
            ))}
          </div>

          <div className="jalali-calendar-days">
            {days.map((day) => (
              <button
                type="button"
                key={day.iso}
                className={[
                  day.currentMonth ? "" : "outside-month",
                  day.iso === value ? "selected" : "",
                  day.iso === todayIso() ? "today" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => {
                  onChange(day.iso);
                  setOpen(false);
                }}
              >
                {fa.format(day.day)}
              </button>
            ))}
          </div>

          <div className="jalali-calendar-footer">
            <button
              type="button"
              onClick={() => {
                const today = todayIso();
                onChange(today);
                setOpen(false);
              }}
            >
              امروز
            </button>
            <button type="button" onClick={() => setOpen(false)}>
              بستن
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function createJalaliPickerDays(year: number, month: number) {
  const firstDayIso = jalaliPartsToIso(year, month, 1);
  if (!firstDayIso) return [];

  const firstDay = parseIso(firstDayIso);
  if (Number.isNaN(firstDay.getTime())) return [];

  const offsetFromSaturday = (firstDay.getDay() + 1) % 7;
  const gridStart = shiftDays(firstDayIso, -offsetFromSaturday);

  return Array.from({ length: 42 }, (_, index) => {
    const iso = shiftDays(gridStart, index);
    const jalali = isoToJalaliParts(iso);

    return {
      iso,
      day: jalali?.jd || 0,
      currentMonth: jalali?.jy === year && jalali?.jm === month,
    };
  });
}

function AgentPanel({
  connected,
  text,
  messages,
  proposal,
  prompt,
  setPrompt,
  busy,
  onSend,
  onQuick,
  onPlan,
  onProposalAction,
  proposalBusy,
  onClose,
}: {
  connected: boolean;
  text: string;
  messages: AgentMessage[];
  proposal: AgentProposal | null;
  prompt: string;
  setPrompt: (v: string) => void;
  busy: boolean;
  onSend: () => void;
  onQuick: (value: string) => void;
  onPlan: () => void;
  onProposalAction: (action: "apply" | "reject" | "undo") => void;
  proposalBusy: boolean;
  onClose: () => void;
}) {
  const hasConversation = messages.length > 0 || Boolean(text) || Boolean(proposal);
  return (
    <div className="agent-panel">
      <div className="agent-head">
        <div className="agent-mark">
          <Sparkles />
        </div>
        <div>
          <b>روزبانی</b>
          <span>{connected ? "متصل به OpenRouter" : "نیاز به اتصال OpenRouter"}</span>
        </div>
        <button onClick={onClose}>
          <X />
        </button>
      </div>
      <div className="agent-body">
        {!hasConversation && !busy && (
          <div className="agent-welcome">
            <Bot />
            <h3>فقط برنامه نمی‌دهم؛ انجامش هم می‌دهم.</h3>
            <p>ساخت، ویرایش، جابه‌جایی، تکمیل و حذف کارها با پیش‌نمایش و تأیید تو.</p>
            <div className="agent-capabilities">
              <button onClick={() => onQuick("چه کارهایی می‌توانی برای من انجام بدهی؟")}>قابلیت‌ها</button>
              <button onClick={() => onQuick("امروز چه کارهایی باید انجام بدهم؟")}>برنامه امروز</button>
              <button onClick={onPlan}>متعادل‌سازی بازه</button>
            </div>
          </div>
        )}
        {messages.length > 0 && (
          <div className="agent-thread">
            {messages.slice(-18).map((message) => (
              <div key={message.id} className={`agent-message ${message.role}`}>
                <span>{message.role === "user" ? "شما" : "روزبانی"}</span>
                <p>{message.content}</p>
              </div>
            ))}
          </div>
        )}
        {busy && (
          <div className="thinking">
            <Loader2 className="spin" />
            <span>روزبانی در حال فکر کردن است…</span>
          </div>
        )}
        {text && !messages.some((message) => message.role === "assistant" && message.content === text) && <div className="agent-answer">{text}</div>}
        {proposal && <AgentProposalCard proposal={proposal} busy={proposalBusy} onAction={onProposalAction} />}
      </div>
      <div className="agent-input">
        {!connected && <small>برای تحلیل‌های هوشمند OpenRouter را متصل کن؛ پرسش «چه کارهایی می‌توانی انجام بدهی؟» بدون اتصال هم پاسخ دارد.</small>}
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              if (!busy && prompt.trim()) onSend();
            }
          }}
          placeholder="مثلاً سه‌شنبه ساعت ۱۰ یک کار برای پیگیری ایمیل بساز…"
        />
        <button onClick={onSend} disabled={busy || !prompt.trim()} aria-label="ارسال پیام">
          <Send />
        </button>
      </div>
    </div>
  );
}

function AgentProposalCard({ proposal, busy, onAction }: { proposal: AgentProposal; busy: boolean; onAction: (action: "apply" | "reject" | "undo") => void }) {
  return (
    <article className={`agent-proposal ${proposal.status}`}>
      <div className="agent-proposal-head">
        <span><Sparkles /> پیش‌نمایش تغییرات</span>
        <b>{proposalStatusLabel(proposal.status)}</b>
      </div>
      <p>{proposal.summary}</p>
      <div className="agent-operations">
        {proposal.operations.map((operation, index) => (
          <div key={`${operation.type}-${index}`}>
            <i>{operation.type === "create" ? "+" : operation.type === "delete" ? "−" : "↻"}</i>
            <span>
              <b>{operationLabel(operation)}</b>
              <small>{operationDateLabel(operation)}</small>
            </span>
          </div>
        ))}
      </div>
      {proposal.status === "pending" && (
        <div className="agent-proposal-actions">
          <button className="secondary" disabled={busy} onClick={() => onAction("reject")}><X /> رد</button>
          <button className="primary" disabled={busy} onClick={() => onAction("apply")}>{busy ? <Loader2 className="spin" /> : <Check />} تأیید و اعمال</button>
        </div>
      )}
      {proposal.status === "applied" && (
        <button className="agent-undo" disabled={busy} onClick={() => onAction("undo")}><RotateCcw /> بازگردانی امن تغییرات</button>
      )}
    </article>
  );
}

function operationLabel(operation: AgentOperation) {
  if (operation.type === "create") return `ساخت «${operation.title}»`;
  if (operation.type === "delete") return "حذف کار انتخاب‌شده";
  if (operation.status === "done") return "علامت‌گذاری کار به‌عنوان انجام‌شده";
  return operation.title ? `ویرایش به «${operation.title}»` : "به‌روزرسانی کار";
}

function operationDateLabel(operation: AgentOperation) {
  if (operation.type === "delete") return "پس از تأیید، از برنامه حذف می‌شود";
  const date = operation.scheduled_date ? isoToJalaliText(operation.scheduled_date) : "تاریخ فعلی";
  const time = operation.start_time ? ` · ساعت ${toFaDigits(operation.start_time)}` : "";
  return `${date}${time}`;
}

function proposalStatusLabel(status: AgentProposal["status"]) {
  return ({ pending: "منتظر تأیید", applied: "اعمال‌شده", rejected: "ردشده", undone: "بازگردانده‌شده", expired: "منقضی" } as const)[status];
}

function PageHeader({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
      {action}
    </div>
  );
}
function CardTitle({ icon, title, meta, action }: { icon: React.ReactNode; title: string; meta?: string; action?: React.ReactNode }) {
  return (
    <div className="card-title">
      <div className="card-title-icon">{icon}</div>
      <div>
        <h2>{title}</h2>
        {meta && <span>{meta}</span>}
      </div>
      {action}
    </div>
  );
}
function Metric({ icon, label, value, note }: { icon: React.ReactNode; label: string; value: string; note: string }) {
  return (
    <article className="card metric-card">
      <span>{icon}</span>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
        <em>{note}</em>
      </div>
    </article>
  );
}
function ScopeTabs({ scope, setScope }: { scope: Scope; setScope: (v: Scope) => void }) {
  return (
    <div className="scope-tabs">
      <button className={scope === "day" ? "active" : ""} onClick={() => setScope("day")}>
        روز
      </button>
      <button className={scope === "week" ? "active" : ""} onClick={() => setScope("week")}>
        هفته
      </button>
      <button className={scope === "month" ? "active" : ""} onClick={() => setScope("month")}>
        ماه
      </button>
    </div>
  );
}
function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <Circle />
      <b>{title}</b>
      <span>{text}</span>
    </div>
  );
}
function Loading() {
  return (
    <div className="loading">
      <div className="loader-leaf">◆</div>
      <span>در حال چیدن روزت…</span>
    </div>
  );
}

function LoginGate({ onSuccess }: { onSuccess: () => void }) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "signup" && password !== confirmPassword) {
        throw new Error("رمز عبور و تکرار آن یکسان نیستند.");
      }

      const response = await fetch("/api/auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: mode,
          username: username.trim(),
          password,
          display_name: mode === "signup" ? displayName.trim() : undefined,
          confirm_password: mode === "signup" ? confirmPassword : undefined,
        }),
      });

      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;

      if (!response.ok || !data?.ok) {
        throw new Error(
          data?.error || (mode === "signup" ? "ثبت‌نام ناموفق بود." : "ورود ناموفق بود."),
        );
      }

      onSuccess();
    } catch (currentError) {
      setError(currentError instanceof Error ? currentError.message : "عملیات ناموفق بود.");
    } finally {
      setBusy(false);
    }
  }

  function changeMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setError("");
    setPassword("");
    setConfirmPassword("");
  }

  return (
    <main className="login-screen">
      <section className="login-showcase">
        <div className="login-showcase-brand"><span>◆</span> ROOZBANI OS</div>
        <span className="eyebrow">برنامه‌ریزی روزانه · پژوهش · مهاجرت</span>
        <h2>از کارهای امروز،<br />تا پذیرش دکتری فردا.</h2>
        <p>یک فضای شخصی برای مدیریت زمان، اپلای، تمرین زبان و تمام قدم‌های مهاجرت — با عاملی که پس از تأیید تو واقعاً کارها را انجام می‌دهد.</p>
        <div className="login-feature-list">
          <span><Bot /><b>عامل عملیاتی</b><small>ساخت، تغییر و حذف امن کارها</small></span>
          <span><CalendarDays /><b>تقویم کاملاً شمسی</b><small>نمای روز، هفته و ماه جلالی</small></span>
          <span><GraduationCap /><b>سیستم اپلای دکتری</b><small>موقعیت، CRM و اتصال به پلنر</small></span>
        </div>
        <em>هر حساب یک فضای کاملاً مستقل دارد.</em>
      </section>
      <form className="login-card card" onSubmit={submit}>
        <div className="login-brand">
          <span>◆</span>
          <b>روزبانی</b>
        </div>

        <div className="auth-tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => changeMode("login")}
          >
            ورود
          </button>
          <button
            type="button"
            className={mode === "signup" ? "active" : ""}
            onClick={() => changeMode("signup")}
          >
            ثبت‌نام
          </button>
        </div>

        <span className="eyebrow">
          {mode === "login" ? "ورود به فضای شخصی" : "ساخت فضای شخصی"}
        </span>
        <h1>{mode === "login" ? "خوش آمدی." : "حساب جدید بساز."}</h1>
        <p>
          {mode === "login"
            ? "نام کاربری و رمز عبور خود را وارد کن."
            : "هر حساب کارها، تنظیمات و اتصال‌های مستقل خود را دارد."}
        </p>

        {mode === "signup" && (
          <label>
            نام نمایشی
            <input
              type="text"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="name"
              placeholder="مثلاً علی"
              maxLength={80}
              required
            />
          </label>
        )}

        <label>
          نام کاربری
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoFocus
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            autoComplete="username"
            placeholder="username"
            dir="ltr"
            minLength={3}
            maxLength={32}
            pattern="[a-zA-Z0-9_.-]+"
            required
          />
        </label>

        <label>
          رمز عبور
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            placeholder="حداقل ۸ کاراکتر"
            minLength={8}
            maxLength={128}
            required
          />
        </label>

        {mode === "signup" && (
          <label>
            تکرار رمز عبور
            <input
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              placeholder="رمز عبور را دوباره وارد کن"
              minLength={8}
              maxLength={128}
              required
            />
          </label>
        )}

        {error && <div className="login-error">{error}</div>}

        <button
          type="submit"
          className="primary wide"
          disabled={
            busy ||
            !username.trim() ||
            !password ||
            (mode === "signup" && (!displayName.trim() || !confirmPassword))
          }
        >
          {busy ? <Loader2 className="spin" /> : <ChevronLeft />}
          {busy ? "در حال پردازش…" : mode === "login" ? "ورود امن" : "ساخت حساب"}
        </button>

        <small>
          رمز عبور به‌صورت هش‌شده ذخیره می‌شود و کلیدهای OpenRouter و تلگرام برای هر حساب جدا هستند.
        </small>
      </form>
    </main>
  );
}

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function normalizeDateDigits(value: string) {
  return value
    .replace(/[۰-۹]/g, (digit) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function todayIso() {
  const now = new Date();
  return [now.getFullYear(), pad2(now.getMonth() + 1), pad2(now.getDate())].join("-");
}

function isToday(date: string) {
  return date === todayIso();
}

function parseIso(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (!match) return new Date(Number.NaN);

  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 12, 0, 0);
}

function toIso(date: Date) {
  if (Number.isNaN(date.getTime())) return "";
  return [date.getFullYear(), pad2(date.getMonth() + 1), pad2(date.getDate())].join("-");
}

function shiftDays(date: string, days: number) {
  const value = parseIso(date);
  if (Number.isNaN(value.getTime())) return date;
  value.setDate(value.getDate() + days);
  return toIso(value);
}

function isoToJalaliParts(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;

  try {
    return toJalaali(Number(match[1]), Number(match[2]), Number(match[3]));
  } catch {
    return null;
  }
}

function jalaliPartsToIso(jy: number, jm: number, jd: number) {
  if (!isValidJalaaliDate(jy, jm, jd)) return null;

  try {
    const { gy, gm, gd } = toGregorian(jy, jm, jd);
    return `${gy}-${pad2(gm)}-${pad2(gd)}`;
  } catch {
    return null;
  }
}

function isoToJalaliText(date: string) {
  const jalali = isoToJalaliParts(date);
  if (!jalali) return "";
  return toFaDigits(`${jalali.jy}/${pad2(jalali.jm)}/${pad2(jalali.jd)}`);
}

function jalaliTextToIso(value: string) {
  const normalized = normalizeDateDigits(value.trim()).replace(/[.\-]/g, "/").replace(/\s+/g, "");
  const match = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(normalized);
  if (!match) return null;

  return jalaliPartsToIso(Number(match[1]), Number(match[2]), Number(match[3]));
}

function shiftMonth(date: string, months: number) {
  const current = isoToJalaliParts(date);
  if (!current) return date;

  const absoluteMonth = current.jy * 12 + (current.jm - 1) + months;
  const nextYear = Math.floor(absoluteMonth / 12);
  const nextMonth = ((absoluteMonth % 12) + 12) % 12 + 1;
  const nextDay = Math.min(current.jd, jalaaliMonthLength(nextYear, nextMonth));

  return jalaliPartsToIso(nextYear, nextMonth, nextDay) ?? date;
}

function scopeRange(date: string, scope: Scope) {
  if (scope === "day") return { from: date, to: date };

  if (scope === "week") {
    const value = parseIso(date);
    if (Number.isNaN(value.getTime())) return { from: date, to: date };

    const offsetFromSaturday = (value.getDay() + 1) % 7;
    return {
      from: shiftDays(date, -offsetFromSaturday),
      to: shiftDays(date, 6 - offsetFromSaturday),
    };
  }

  const jalali = isoToJalaliParts(date);
  if (!jalali) return { from: date, to: date };

  const monthLength = jalaaliMonthLength(jalali.jy, jalali.jm);
  return {
    from: jalaliPartsToIso(jalali.jy, jalali.jm, 1) ?? date,
    to: jalaliPartsToIso(jalali.jy, jalali.jm, monthLength) ?? date,
  };
}

function weekDays(date: string) {
  const range = scopeRange(date, "week");
  return Array.from({ length: 7 }, (_, index) => shiftDays(range.from, index));
}

function weekday(date: string) {
  const value = parseIso(date);
  if (Number.isNaN(value.getTime())) return "";
  return ["ی", "د", "س", "چ", "پ", "ج", "ش"][value.getDay()];
}

function longPersianDate(date: string) {
  const value = parseIso(date);
  if (Number.isNaN(value.getTime())) return "";

  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(value);
}

function shortPersianDate(date: string) {
  const value = parseIso(date);
  if (Number.isNaN(value.getTime())) return "";

  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    day: "numeric",
    month: "long",
  }).format(value);
}

function monthTitle(date: string) {
  const jalali = isoToJalaliParts(date);
  if (!jalali) return "";
  return `${JALALI_MONTHS[jalali.jm - 1]} ${fa.format(jalali.jy)}`;
}

function toFaDigits(value: string | number) {
  return String(value).replace(/\d/g, (digit) => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function statusLabel(status: string) {
  return (
    {
      pending: "در انتظار",
      in_progress: "در حال انجام",
      done: "انجام‌شده",
      cancelled: "لغوشده",
    } as Record<string, string>
  )[status] || status;
}

function calendarDays(date: string) {
  const selected = isoToJalaliParts(date);
  if (!selected) return [];

  const firstDayIso = jalaliPartsToIso(selected.jy, selected.jm, 1) ?? date;
  const firstDay = parseIso(firstDayIso);
  if (Number.isNaN(firstDay.getTime())) return [];

  const offsetFromSaturday = (firstDay.getDay() + 1) % 7;
  const gridStart = shiftDays(firstDayIso, -offsetFromSaturday);

  return Array.from({ length: 42 }, (_, index) => {
    const iso = shiftDays(gridStart, index);
    const jalali = isoToJalaliParts(iso);

    return {
      iso,
      day: jalali?.jd ?? 0,
      current: jalali?.jy === selected.jy && jalali?.jm === selected.jm,
    };
  });
}
