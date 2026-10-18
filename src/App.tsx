import { useEffect, useRef, useState, type FormEvent } from "react";
import type { Session } from "@supabase/supabase-js";
import PulseCard from "./components/PulseCard";
import CalendarSection, { UpcomingEvents } from "./components/Calendar";
import { useCalendarData } from "./lib/calendar";
import { useRequestHistory } from "./lib/history";
import Academy from "./components/Academy";
import { EmptyArt } from "./components/Art";
import {
  LayoutDashboard,
  FileText,
  GraduationCap,
  Bell,
  UserCircle,
  Plus,
  Clock3,
  CheckCircle2,
  XCircle,
  CalendarDays,
  Wallet,
  ShieldCheck,
  LogOut,
  HeartPulse,
  Sun,
  Moon,
  Bot,
  ClipboardCheck,
} from "lucide-react";
import { supabase } from "./lib/supabase";
import AuthForm from "./AuthForm";
import AssistantPanel from "./AssistantPanel";
import "./App.css";

type Role = "employee" | "manager" | "hr";
type RequestStatus = "На рассмотрении" | "Одобрена" | "Отклонена";
type WorkflowStage = "manager" | "hr" | "done";
type LeaveType = "paid" | "unpaid";
type Theme = "light" | "dark";

type RequestItem = {
  id: string;
  user_id: string;
  request_type: string;
  start_date: string | null;
  end_date: string | null;
  amount: number | null;
  details: string;
  conditions: string[];
  employee_comment: string;
  leave_type: LeaveType | null;
  leave_days_requested: number | null;
  leave_balance_at_submission: number | null;
  approver_manager_id: string | null;
  workflow_stage: WorkflowStage;
  manager_comment: string;
  manager_reviewed_by: string | null;
  manager_reviewed_at: string | null;
  status: RequestStatus;
  hr_comment: string;
  hr_signed_by: string | null;
  hr_signed_at: string | null;
  created_at: string;
};

const THEME_KEY = "janamen-theme";

const requestTypes = [
  "Ежегодный отпуск",
  "Аванс",
  "Справка с места работы",
  "Изменение персональных данных",
] as const;

const conditionOptions: Record<string, string[]> = {
  "Ежегодный отпуск": [
    "Ознакомлен(а) с графиком отпусков",
    "Передал(а) текущие задачи",
    "Согласовал(а) даты с руководителем",
  ],
  Аванс: [
    "Аванс требуется в текущем месяце",
    "Сумма предварительно согласована",
    "Указана причина запроса",
  ],
  "Справка с места работы": [
    "Проверены персональные данные",
    "Указана цель получения справки",
    "Выбран электронный формат, если подходит",
  ],
  "Изменение персональных данных": [
    "Новые данные указаны корректно",
    "Подтверждающие документы подготовлены",
    "Проверены все изменения",
  ],
};

function getErrorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const e = error as {
      message?: string;
      details?: string | null;
      hint?: string | null;
      code?: string | null;
    };

    return [
      e.message,
      e.details,
      e.hint ? `Подсказка: ${e.hint}` : "",
      e.code ? `Код: ${e.code}` : "",
    ]
      .filter(Boolean)
      .join(" | ") || JSON.stringify(error);
  }

  if (error instanceof Error) return error.message;
  return String(error || "Неизвестная ошибка");
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Если хранилище недоступно, используем системную тему.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function StatusLabel({ status, workflowStage }: { status: RequestStatus; workflowStage?: WorkflowStage }) {
  const className =
    status === "Одобрена"
      ? "status-approved"
      : status === "Отклонена"
        ? "status-rejected"
        : "status-pending";
  const label = status === "На рассмотрении"
    ? workflowStage === "manager" ? "Ожидает руководителя" : "Ожидает HR"
    : status;

  return <span className={`status-label ${className}`}>{label}</span>;
}

function calculateLeaveDays(startDate: string, endDate: string): number {
  if (!startDate || !endDate || endDate < startDate) return 0;
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86_400_000) + 1;
}

function roleLabel(role: Role): string {
  if (role === "hr") return "HR";
  if (role === "manager") return "Руководитель";
  return "Сотрудник";
}

/** Плавно увеличивает число при изменении значения. */
function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const currentRef = useRef(0);
  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  useEffect(() => {
    if (reduceMotion || currentRef.current === value) return;

    const from = currentRef.current;
    const start = performance.now();
    const duration = 900;
    let frame = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      currentRef.current = Math.round(from + (value - from) * eased);
      setDisplay(currentRef.current);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };

    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, reduceMotion]);

  return <>{reduceMotion ? value : display}</>;
}

/** Ромб со скруглёнными углами для декоративной иллюстрации баннера. */
function roundedDiamond(cx: number, cy: number, a: number, b: number, r: number) {
  const points: [number, number][] = [
    [cx, cy - b],
    [cx + a, cy],
    [cx, cy + b],
    [cx - a, cy],
  ];
  const k = r / Math.hypot(a, b);
  let path = "";

  points.forEach(([x, y], index) => {
    const [px, py] = points[(index + 3) % 4];
    const [nx, ny] = points[(index + 1) % 4];
    const startX = x + (px - x) * k;
    const startY = y + (py - y) * k;
    const endX = x + (nx - x) * k;
    const endY = y + (ny - y) * k;
    path += `${index === 0 ? "M" : "L"}${startX},${startY} Q${x},${y} ${endX},${endY} `;
  });

  return `${path}Z`;
}

function Plates() {
  const cx = 130;
  const a = 92;
  const b = 46;
  const thickness = 18;
  const topY = 62;
  const bottomY = 168;
  const topFace = roundedDiamond(cx, topY, a, b, 26);
  const bottomFace = roundedDiamond(cx, bottomY, a, b, 26);

  return (
    <svg className="plates" viewBox="0 0 260 270" aria-hidden="true">
      <defs>
        <linearGradient id="pl-side" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0" stopColor="#0d6840" />
          <stop offset="0.45" stopColor="#43bd78" />
          <stop offset="0.7" stopColor="#168653" />
          <stop offset="1" stopColor="#0a5333" />
        </linearGradient>
        <linearGradient id="pl-edge" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#168653" />
          <stop offset="1" stopColor="#8be7ae" />
        </linearGradient>
        <radialGradient id="pl-glow" cx="50%" cy="50%" r="50%">
          <stop offset="0" stopColor="#43bd78" stopOpacity="0.55" />
          <stop offset="1" stopColor="#43bd78" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g className="plate-guides">
        <line x1={cx - a} y1={topY + 8} x2={cx - a} y2={bottomY} />
        <line x1={cx + a} y1={topY + 8} x2={cx + a} y2={bottomY} />
      </g>

      <g className="plate-bottom-group">
        <path d={bottomFace} transform={`translate(0 ${thickness})`} fill="url(#pl-side)" />
        <rect x={cx - a + 12} y={bottomY} width={a * 2 - 24} height={thickness} fill="url(#pl-side)" />
        <path d={bottomFace} fill="var(--surface-solid)" stroke="url(#pl-edge)" strokeWidth="1.6" />
        <ellipse className="plate-sheen" cx={cx} cy={bottomY} rx="70" ry="30" fill="url(#pl-glow)" />
      </g>

      <g className="plate-top-group">
        <path d={topFace} transform={`translate(0 ${thickness})`} fill="var(--plate-side)" stroke="var(--plate-line)" strokeWidth="1.2" />
        <rect x={cx - a + 12} y={topY} width={a * 2 - 24} height={thickness} fill="var(--plate-side)" />
        <path d={topFace} fill="var(--plate-top)" stroke="var(--plate-line)" strokeWidth="1.4" />
      </g>
    </svg>
  );
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<Role>("employee");
  const [managerId, setManagerId] = useState<string | null>(null);
  const [remainingLeaveDays, setRemainingLeaveDays] = useState<number | null>(null);
  const [requests, setRequests] = useState<RequestItem[]>([]);
  const { events, people, error: calendarError, reload: reloadCalendar } = useCalendarData(session);
  const historyByRequest = useRequestHistory(session, requests.map((r) => `${r.id}${r.status}${r.workflow_stage}`).join(","));
  const nameOf = (id: string) => people.find((p) => p.user_id === id)?.display_name ?? id;
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [requestType, setRequestType] = useState<string>("Ежегодный отпуск");
  const [leaveType, setLeaveType] = useState<LeaveType>("paid");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [amount, setAmount] = useState("");
  const [details, setDetails] = useState("");
  const [employeeComment, setEmployeeComment] = useState("");
  const [conditions, setConditions] = useState<string[]>([]);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<"Все" | RequestStatus>("Все");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Тема останется активной до перезагрузки страницы.
    }
  }, [theme]);

  // Световой блик следует за курсором, а декоративные плиты слегка реагируют на него.
  useEffect(() => {
    function onPointerMove(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      const element = target?.closest<HTMLElement>(".spot, .welcome-panel");
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      element.style.setProperty("--mx", `${x}px`);
      element.style.setProperty("--my", `${y}px`);

      if (element.classList.contains("welcome-panel") && rect.width > 0 && rect.height > 0) {
        element.style.setProperty("--px", String((x / rect.width - 0.5) * 2));
        element.style.setProperty("--py", String((y / rect.height - 0.5) * 2));
      }
    }

    document.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => document.removeEventListener("pointermove", onPointerMove);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function restoreSession() {
      try {
        const { data, error } = await supabase.auth.getSession();
        if (!mounted) return;
        if (error) setNotice(`Ошибка проверки авторизации: ${getErrorMessage(error)}`);
        setSession(data.session);
      } catch (error) {
        if (mounted) {
          setNotice(`Не удалось проверить авторизацию: ${getErrorMessage(error)}`);
          setSession(null);
        }
      } finally {
        if (mounted) setAuthLoading(false);
      }
    }

    void restoreSession();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadData() {
      if (!session) {
        setRole("employee");
        setManagerId(null);
        setRemainingLeaveDays(null);
        setRequests([]);
        setLoadingRequests(false);
        return;
      }

      setLoadingRequests(true);

      try {
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role, manager_id, annual_leave_days_remaining")
          .eq("user_id", session.user.id)
          .single();

        if (profileError) {
          throw new Error(
            `Не удалось получить профиль пользователя. ${getErrorMessage(profileError)}`,
          );
        }

        const profileRole = String(profile.role ?? "employee");
        const userRole: Role = profileRole === "hr" || profileRole === "manager" ? profileRole : "employee";
        const { data, error } = await supabase
          .from("requests")
          .select("*")
          .order("created_at", { ascending: false });

        if (error) {
          throw new Error(`Не удалось получить заявки. ${getErrorMessage(error)}`);
        }

        if (cancelled) return;
        const loadedRequests = (data ?? []) as RequestItem[];

        // Проверяем изменения статусов сразу после ответа Supabase, а не отдельным
        // эффектом, который синхронно меняет состояние React.
        const seenKey = `janamen-seen-${session.user.id}`;
        let previousStatuses: Record<string, string> = {};
        try {
          const raw = localStorage.getItem(seenKey);
          previousStatuses = raw ? JSON.parse(raw) as Record<string, string> : {};
        } catch {
          previousStatuses = {};
        }
        const ownRequests = loadedRequests.filter((request) => request.user_id === session.user.id);
        const changedRequests = ownRequests.filter((request) => {
          const previous = previousStatuses[request.id];
          return Boolean(previous) && previous !== `${request.status}|${request.workflow_stage}`;
        });
        const nextStatuses: Record<string, string> = {};
        for (const request of ownRequests) {
          nextStatuses[request.id] = `${request.status}|${request.workflow_stage}`;
        }
        try {
          localStorage.setItem(seenKey, JSON.stringify(nextStatuses));
        } catch {
          // Уведомления продолжат работать на время текущей загрузки.
        }

        setRole(userRole);
        setManagerId(typeof profile.manager_id === "string" ? profile.manager_id : null);
        setRemainingLeaveDays(
          Number.isInteger(profile.annual_leave_days_remaining)
            ? Number(profile.annual_leave_days_remaining)
            : null,
        );
        setRequests(loadedRequests);
        setNotice(
          changedRequests.length > 0
            ? `Обновление по заявке: ${changedRequests.map((request) => `«${request.request_type}» — ${request.status}`).join("; ")}`
            : "",
        );
      } catch (error) {
        if (!cancelled) {
          setNotice(`Не удалось загрузить данные: ${getErrorMessage(error)}`);
        }
      } finally {
        if (!cancelled) setLoadingRequests(false);
      }
    }

    void loadData();
    return () => {
      cancelled = true;
    };
  }, [session]);

  function describeRequest(r: RequestItem): string {
    const state = r.status !== "На рассмотрении" ? r.status.toLowerCase() : r.workflow_stage === "manager" ? "ждёт согласования руководителя" : "ждёт решения HR";
    return `${r.request_type}${r.start_date ? ` (${r.start_date})` : ""} — ${state}${r.hr_comment ? `; комментарий HR: ${r.hr_comment}` : r.manager_comment ? `; комментарий руководителя: ${r.manager_comment}` : ""}`;
  }

  function notify(message: string) {
    setNotice(message);
  }

  function scrollToSection(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  }

  function resetForm() {
    setStartDate("");
    setEndDate("");
    setLeaveType("paid");
    setAmount("");
    setDetails("");
    setEmployeeComment("");
    setConditions([]);
  }

  function toggleCondition(condition: string) {
    setConditions((current) =>
      current.includes(condition)
        ? current.filter((item) => item !== condition)
        : [...current, condition],
    );
  }

  async function createRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      notify("Сначала войдите в аккаунт.");
      return;
    }

    if (role === "hr") {
      notify("HR может просматривать и обрабатывать заявки, но не создавать их.");
      return;
    }

    if (role === "employee" && !managerId) {
      notify("Не назначен руководитель. Сначала укажите руководителя сотрудника в public.profiles.manager_id.");
      return;
    }

    if (requestType === "Ежегодный отпуск" && (!startDate || !endDate || endDate < startDate)) {
      notify("Укажите корректные даты отпуска.");
      return;
    }

    const daysRequested = requestType === "Ежегодный отпуск"
      ? calculateLeaveDays(startDate, endDate)
      : null;

    if (requestType === "Ежегодный отпуск" && leaveType === "paid") {
      if (remainingLeaveDays === null) {
        notify("Остаток оплачиваемых дней не задан. Обратитесь в HR, чтобы заполнить его в профиле.");
        return;
      }
      if (daysRequested !== null && daysRequested > remainingLeaveDays) {
        notify(`Запрошено ${daysRequested} дн., а доступно только ${remainingLeaveDays} дн. оплачиваемого отпуска.`);
        return;
      }
    }

    if (requestType === "Аванс" && (!amount || Number(amount) <= 0)) {
      notify("Укажите сумму аванса больше нуля.");
      return;
    }

    setBusy(true);

    try {
      const { data, error } = await supabase
        .from("requests")
        .insert({
          user_id: session.user.id,
          request_type: requestType,
          start_date: startDate || null,
          end_date: endDate || null,
          amount: requestType === "Аванс" ? Number(amount) : null,
          details: details.trim(),
          conditions,
          employee_comment: employeeComment.trim(),
          leave_type: requestType === "Ежегодный отпуск" ? leaveType : null,
          leave_days_requested: daysRequested,
          leave_balance_at_submission: requestType === "Ежегодный отпуск" && leaveType === "paid"
            ? remainingLeaveDays
            : null,
        })
        .select("*")
        .single();

      if (error) throw error;

      setRequests((current) => [data as RequestItem, ...current]);
      resetForm();
      setShowForm(false);
      const routeMessage = (data as RequestItem).workflow_stage === "manager"
        ? "Заявка отправлена руководителю на первый этап согласования."
        : "Заявка отправлена в HR на рассмотрение.";
      notify(routeMessage);
    } catch (error) {
      notify(`Не удалось отправить заявку: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reviewManagerRequest(request: RequestItem, approved: boolean) {
    if (role !== "manager" || !session || request.approver_manager_id !== session.user.id || request.workflow_stage !== "manager") return;
    setBusy(true);

    const status: RequestStatus = approved ? "На рассмотрении" : "Отклонена";
    try {
      const { data, error } = await supabase
        .from("requests")
        .update({
          status,
          workflow_stage: approved ? "hr" : "done",
          manager_comment: (reviewComments[request.id] ?? "").trim(),
        })
        .eq("id", request.id)
        .select("*")
        .single();

      if (error) throw error;

      setRequests((current) => current.map((item) => item.id === request.id ? (data as RequestItem) : item));
      setReviewComments((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });
      notify(approved
        ? "Руководитель согласовал заявку. Она передана на следующий этап — в HR."
        : "Руководитель отклонил заявку. Решение сохранено.");
    } catch (error) {
      notify(`Не удалось сохранить решение руководителя: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function reviewRequest(request: RequestItem, status: RequestStatus) {
    if (role !== "hr" || !session || request.workflow_stage !== "hr" || request.status !== "На рассмотрении") return;
    setBusy(true);

    try {
      const { data, error } = await supabase
        .from("requests")
        .update({
          status,
          workflow_stage: "done",
          hr_comment: (reviewComments[request.id] ?? "").trim(),
        })
        .eq("id", request.id)
        .select("*")
        .single();

      if (error) throw error;

      setRequests((current) =>
        current.map((item) => (item.id === request.id ? (data as RequestItem) : item)),
      );
      setReviewComments((current) => {
        const next = { ...current };
        delete next[request.id];
        return next;
      });

      notify(
        status === "Одобрена"
          ? "HR одобрил заявку. Подпись сохранена; оплачиваемые дни отпуска списаны, если применимо."
          : "HR отклонил заявку. Решение и отметка HR сохранены.",
      );
    } catch (error) {
      notify(`Не удалось сохранить решение HR: ${getErrorMessage(error)}`);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setSigningOut(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) notify(`Не удалось выйти: ${getErrorMessage(error)}`);
    } catch (error) {
      notify(`Не удалось выйти: ${getErrorMessage(error)}`);
    } finally {
      setSigningOut(false);
    }
  }

  const roleVisibleRequests = requests.filter((request) =>
    role === "hr"
      ? true
      : role === "manager"
        ? request.user_id === session?.user.id || request.approver_manager_id === session?.user.id
        : request.user_id === session?.user.id,
  );
  const pendingCount = roleVisibleRequests.filter((request) =>
    request.status === "На рассмотрении" &&
    (role === "manager"
      ? request.workflow_stage === "manager" && request.approver_manager_id === session?.user.id
      : role === "hr"
        ? request.workflow_stage === "hr"
        : true),
  ).length;
  const requestedLeaveDays = calculateLeaveDays(startDate, endDate);
  const canRequestPaidLeave = remainingLeaveDays !== null && requestedLeaveDays > 0 && requestedLeaveDays <= remainingLeaveDays;
  const visibleRequests = roleVisibleRequests.filter(
    (request) => statusFilter === "Все" || request.status === statusFilter,
  );

  if (authLoading) {
    return (
      <div className="auth-page">
        <p>Загрузка JanaМен...</p>
      </div>
    );
  }

  if (!session) return <AuthForm onSuccess={() => {}} />;

  return (
    <div className="janamen-app">
      <div className="aurora" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>

      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">J</div>
          <div>
            <div className="brand-name">JanaМен</div>
            <div className="brand-caption">Портал сотрудника</div>
          </div>
        </div>

        <div className="sidebar-label">МЕНЮ</div>
        <nav className="sidebar-nav">
          <button
            className="nav-item active"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          >
            <LayoutDashboard size={19} />
            Главная
          </button>
          <button className="nav-item" type="button" onClick={() => scrollToSection("requests")}>
            <FileText size={19} />
            {role === "hr" ? "Все заявки" : role === "manager" ? "Заявки команды" : "Мои заявки"}
            {pendingCount > 0 && <span className="nav-count">{pendingCount}</span>}
          </button>
          <button className="nav-item" type="button" onClick={() => scrollToSection("calendar")}>
            <CalendarDays size={19} />
            Календарь
          </button>
          <button className="nav-item" type="button" onClick={() => scrollToSection("pulse")}>
            <HeartPulse size={19} />
            Jana Pulse
          </button>
          <button className="nav-item" type="button" onClick={() => scrollToSection("academy")}>
            <GraduationCap size={19} />
            Jana Academy
          </button>
          <button className="nav-item" type="button" onClick={() => scrollToSection("assistant")}>
            <Bot size={19} />
            HR-ассистент
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help-icon"><ShieldCheck size={21} /></div>
          <strong>{role === "hr" ? "Кадровый контроль" : role === "manager" ? "Команда и согласование" : "JanaМен"}</strong>
          <p>
            {role === "hr"
              ? "Финальный этап: проверка, решение и подпись HR."
              : role === "manager"
                ? "Первый этап согласования заявок сотрудников и свои заявки."
                : "Ваши рабочие вопросы — в одном месте."}
          </p>
        </div>
      </aside>

      <main className="main-content">
        <header className="topbar reveal" style={{ ["--i" as string]: 0 }}>
          <div>
            <div className="breadcrumb">Портал / Главная</div>
            <h1>{role === "hr" ? "Кабинет HR" : role === "manager" ? "Кабинет руководителя" : "Добро пожаловать!"}</h1>
          </div>

          <div className="topbar-actions">
            <button
              className="icon-button theme-toggle"
              type="button"
              aria-label={theme === "dark" ? "Включить светлую тему" : "Включить тёмную тему"}
              title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
              onClick={() => setTheme((current) => (current === "dark" ? "light" : "dark"))}
            >
              {theme === "dark" ? <Sun key="sun" size={20} /> : <Moon key="moon" size={20} />}
            </button>

            <button
              className="icon-button notification-button"
              type="button"
              aria-label="Уведомления"
              onClick={() =>
                notify(
                  pendingCount > 0
                    ? `Заявок на рассмотрении: ${pendingCount}.`
                    : "Нет заявок, ожидающих решения.",
                )
              }
            >
              <Bell size={20} />
              {pendingCount > 0 && <span className="notification-dot" />}
            </button>

            <div className="profile-mini">
              <div className="avatar"><UserCircle size={25} /></div>
              <div className="profile-mini-text">
                <strong>{session.user.email ?? "Пользователь"}</strong>
                <span>{roleLabel(role)}</span>
              </div>
            </div>

            <button type="button" className="secondary-button" onClick={() => void logout()} disabled={signingOut}>
              <LogOut size={16} />
              {signingOut ? "Выходим..." : "Выйти"}
            </button>
          </div>
        </header>

        {notice && (
          <div className="notice-message" role="status">
            <CheckCircle2 size={18} />
            <span>{notice}</span>
            <button type="button" aria-label="Закрыть уведомление" onClick={() => setNotice("")}>×</button>
          </div>
        )}

        <section className="welcome-panel reveal" style={{ ["--i" as string]: 1 }}>
          <div className="welcome-copy">
            <span className="eyebrow"><span className="live-dot" />
              {role === "hr" ? "ФИНАЛЬНОЕ СОГЛАСОВАНИЕ" : role === "manager" ? "СОГЛАСОВАНИЕ КОМАНДЫ" : "ВАШЕ РАБОЧЕЕ ПРОСТРАНСТВО"}
            </span>
            <h2>
              {role === "hr" ? "Финальный этап заявок" : role === "manager" ? "Заявки команды" : <>Всё для работы <em>в одном месте</em></>}
            </h2>
            <p>
              {role === "hr"
                ? "Рассматривайте только заявки, прошедшие этап руководителя, и фиксируйте итоговое решение."
                : role === "manager"
                  ? "Согласовывайте заявки назначенных сотрудников и при необходимости оформляйте собственные."
                  : "Отправляйте заявки руководителю, изучайте материалы и отслеживайте этапы согласования."}
            </p>
            {role !== "hr" && (
              <button className="primary-button" type="button" onClick={() => { setShowForm((value) => !value); setNotice(""); }}>
                <Plus size={18} />
                {showForm ? "Скрыть форму" : "Создать заявку"}
              </button>
            )}
          </div>
          <div className="welcome-illustration">
            <Plates />
            <div className="floating-check"><CheckCircle2 size={23} /></div>
          </div>
        </section>

        {showForm && role !== "hr" && (
          <section className="request-form-card spot">
            <div className="section-heading">
              <div>
                <h2>Новая заявка</h2>
                <p>Заполните поля — часть условий уже подготовлена.</p>
              </div>
              <button className="close-form-button" type="button" onClick={() => setShowForm(false)} aria-label="Закрыть форму">×</button>
            </div>

            <form onSubmit={createRequest}>
              <label htmlFor="requestType">Тип заявки</label>
              <select
                id="requestType"
                value={requestType}
                onChange={(event) => {
                  setRequestType(event.target.value);
                  setConditions([]);
                  setStartDate("");
                  setEndDate("");
                  setAmount("");
                }}
              >
                {requestTypes.map((type) => <option key={type}>{type}</option>)}
              </select>

              {requestType === "Ежегодный отпуск" && (
                <>
                  <label htmlFor="leaveType">Тип отпуска</label>
                  <select id="leaveType" value={leaveType} onChange={(event) => setLeaveType(event.target.value as LeaveType)}>
                    <option value="paid">Оплачиваемый ежегодный отпуск</option>
                    <option value="unpaid">Отпуск без сохранения заработной платы</option>
                  </select>
                  <label htmlFor="startDate">Дата начала отпуска</label>
                  <input id="startDate" type="date" required value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                  <label htmlFor="endDate">Дата окончания отпуска</label>
                  <input id="endDate" type="date" min={startDate || undefined} required value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                  <div className="leave-summary">
                    <strong>Запрашиваемая длительность: {requestedLeaveDays > 0 ? `${requestedLeaveDays} дн.` : "укажите даты отпуска"}</strong>
                    {leaveType === "paid" ? <>
                      <span>Остаток оплачиваемых дней: {remainingLeaveDays === null ? "не задан" : `${remainingLeaveDays} дн.`}</span>
                      {remainingLeaveDays === null
                        ? <span className="leave-warning">HR должен указать остаток дней в профиле сотрудника.</span>
                        : requestedLeaveDays > 0 && requestedLeaveDays > remainingLeaveDays
                          ? <span className="leave-warning">Недостаточно дней для выбранного периода.</span>
                          : requestedLeaveDays > 0
                            ? <span className="leave-ok">После одобрения останется {remainingLeaveDays - requestedLeaveDays} дн.</span>
                            : <span>Остаток будет проверен при отправке заявки.</span>}
                    </> : <span>Для отпуска без содержания остаток оплачиваемых дней не используется.</span>}
                  </div>
                </>
              )}

              {requestType === "Аванс" && (
                <>
                  <label htmlFor="amount">Сумма аванса</label>
                  <input id="amount" type="number" min="1" step="0.01" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="Введите сумму" />
                </>
              )}

              <label>Условия заявки</label>
              <div className="conditions-list">
                {(conditionOptions[requestType] ?? []).map((condition) => (
                  <label key={condition} className="condition-option">
                    <input type="checkbox" checked={conditions.includes(condition)} onChange={() => toggleCondition(condition)} />
                    <span>{condition}</span>
                  </label>
                ))}
              </div>

              <label htmlFor="details">Дополнительные сведения</label>
              <textarea id="details" value={details} onChange={(event) => setDetails(event.target.value)} placeholder="Например, цель справки или какие данные нужно изменить..." rows={3} />

              <label htmlFor="employeeComment">Комментарий сотрудника</label>
              <textarea id="employeeComment" value={employeeComment} onChange={(event) => setEmployeeComment(event.target.value)} placeholder="Дополнительные пожелания или пояснения..." rows={2} />

              <div className="form-actions">
                <button className="secondary-button" type="button" onClick={() => setShowForm(false)}>Отмена</button>
                <button className="primary-button" type="submit" disabled={busy || (requestType === "Ежегодный отпуск" && leaveType === "paid" && requestedLeaveDays > 0 && !canRequestPaidLeave)}>
                  <Plus size={17} />
                  {busy ? "Отправка..." : "Отправить заявку"}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="stats-grid">
          <article className="stat-card spot reveal" style={{ ["--i" as string]: 2 }}>
            <div className="stat-icon stat-purple"><FileText size={22} /></div>
            <div>
              <span className="stat-label">{role === "hr" ? "Всего заявок" : role === "manager" ? "Заявки команды и мои" : "Мои заявки"}</span>
              <div className="stat-number"><CountUp value={roleVisibleRequests.length} /></div>
              <span className="stat-footnote">В базе JanaМен</span>
            </div>
          </article>
          <article className="stat-card spot reveal" style={{ ["--i" as string]: 3 }}>
            <div className="stat-icon stat-orange"><Clock3 size={22} /></div>
            <div>
              <span className="stat-label">На рассмотрении</span>
              <div className="stat-number"><CountUp value={roleVisibleRequests.filter((item) => item.status === "На рассмотрении").length} /></div>
              <span className="stat-footnote">Ожидают решения</span>
            </div>
          </article>
          <article className="stat-card spot reveal" style={{ ["--i" as string]: 4 }}>
            <div className="stat-icon stat-green"><CheckCircle2 size={22} /></div>
            <div>
              <span className="stat-label">Одобрено</span>
              <div className="stat-number"><CountUp value={roleVisibleRequests.filter((item) => item.status === "Одобрена").length} /></div>
              <span className="stat-footnote">Решение принято</span>
            </div>
          </article>
          <article className="stat-card spot reveal" style={{ ["--i" as string]: 5 }}>
            <div className="stat-icon stat-red"><XCircle size={22} /></div>
            <div>
              <span className="stat-label">Отклонено</span>
              <div className="stat-number"><CountUp value={roleVisibleRequests.filter((item) => item.status === "Отклонена").length} /></div>
              <span className="stat-footnote">Решение принято</span>
            </div>
          </article>
        </section>

        <section className="requests-section" id="requests">
          <div className="section-heading">
            <div>
              <h2>{role === "hr" ? "Заявки сотрудников" : role === "manager" ? "Заявки команды и мои заявки" : "Мои заявки"}</h2>
              <p>{role === "hr" ? "Проверяйте заявки, прошедшие согласование руководителя, и принимайте итоговое решение." : role === "manager" ? "Согласовывайте заявки назначенной команды; свои заявки также доступны в этом списке." : "Отслеживайте, на каком этапе находится заявка, и читайте комментарии."}</p>
            </div>
            <span className="total-badge">{visibleRequests.length} из {roleVisibleRequests.length}</span>
          </div>

          <div className="request-filters">
            {(["Все", "На рассмотрении", "Одобрена", "Отклонена"] as const).map((filter) => (
              <button
                key={filter}
                type="button"
                className={statusFilter === filter ? "primary-button" : "secondary-button"}
                onClick={() => setStatusFilter(filter)}
              >
                {filter} ({filter === "Все" ? roleVisibleRequests.length : roleVisibleRequests.filter((item) => item.status === filter).length})
              </button>
            ))}
          </div>

          {loadingRequests ? (
            <div className="empty-state"><p>Загружаем заявки...</p></div>
          ) : visibleRequests.length === 0 ? (
            <div className="empty-state">
              <EmptyArt />
              <strong>{roleVisibleRequests.length === 0 ? "Заявок пока нет" : "По фильтру заявок нет"}</strong>
              <p>
                {roleVisibleRequests.length === 0
                  ? role === "hr" ? "После согласования руководителем заявки появятся здесь." : "Создайте первую заявку, чтобы она появилась здесь."
                  : "Выберите другой статус, чтобы увидеть заявки."}
              </p>
            </div>
          ) : (
            <div className="requests-list">
              {visibleRequests.map((request, index) => (
                <article className="request-item spot" key={request.id} style={{ animationDelay: `${Math.min(index, 8) * 60}ms` }}>
                  <div className="request-icon">
                    {request.request_type === "Аванс" ? <Wallet size={21} /> : <CalendarDays size={21} />}
                  </div>

                  <div className="request-info">
                    <strong>{request.request_type}</strong>
                    {(role === "hr" || role === "manager") && <small>Сотрудник: {nameOf(request.user_id)}</small>}
                    {request.start_date && <span>Даты: {request.start_date}{request.end_date ? ` — ${request.end_date}` : ""}</span>}
                    {request.leave_type && <span>Тип отпуска: {request.leave_type === "paid" ? "Оплачиваемый" : "Без сохранения заработной платы"}</span>}
                    {request.leave_days_requested !== null && request.leave_days_requested !== undefined && <span>Длительность: {request.leave_days_requested} дн.</span>}
                    {request.leave_type === "paid" && request.leave_balance_at_submission !== null && request.leave_balance_at_submission !== undefined && <span>Доступный остаток на момент заявки: {request.leave_balance_at_submission} дн.</span>}
                    {request.amount !== null && <span>Сумма: {request.amount}</span>}
                    {request.conditions?.length > 0 && (
                      <div>
                        <strong>Условия:</strong>
                        <ul>{request.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
                      </div>
                    )}
                    {request.details && <span>{request.details}</span>}
                    {request.employee_comment && <span><strong>Комментарий сотрудника:</strong> {request.employee_comment}</span>}
                    <small>Создана: {new Date(request.created_at).toLocaleString("ru-RU")}</small>
                    {(historyByRequest[request.id]?.length ?? 0) > 0 && (
                      <ul className="history-list" aria-label="История статусов">
                        {historyByRequest[request.id].map((h) => (
                          <li key={h.id}>
                            <strong>{h.event}</strong>
                            {new Date(h.created_at).toLocaleString("ru-RU")}{h.comment ? ` · «${h.comment}»` : ""}
                          </li>
                        ))}
                      </ul>
                    )}

                    {request.manager_comment && <div className="manager-comment-box"><strong>Комментарий руководителя:</strong> {request.manager_comment}</div>}
                    {request.manager_reviewed_at && <div className="manager-comment-box"><strong>Руководитель рассмотрел:</strong> {new Date(request.manager_reviewed_at).toLocaleString("ru-RU")}</div>}
                    {request.hr_comment && <div className="hr-comment-box"><strong>Комментарий HR:</strong> {request.hr_comment}</div>}
                    {request.hr_signed_at && (
                      <div className="hr-comment-box">
                        <strong>Отметка HR:</strong> {request.hr_signed_by || "HR"}
                        <br />
                        <small>{new Date(request.hr_signed_at).toLocaleString("ru-RU")}</small>
                      </div>
                    )}

                    {role === "manager" && request.status === "На рассмотрении" && request.workflow_stage === "manager" && request.approver_manager_id === session.user.id && (
                      <div className="hr-review">
                        <label htmlFor={`manager-${request.id}`}>Комментарий руководителя</label>
                        <textarea
                          id={`manager-${request.id}`}
                          rows={2}
                          value={reviewComments[request.id] ?? ""}
                          onChange={(event) => setReviewComments((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Комментарий, условия или причина отказа..."
                        />
                        <div className="form-actions">
                          <button className="secondary-button" type="button" disabled={busy} onClick={() => void reviewManagerRequest(request, false)}>Отклонить</button>
                          <button className="primary-button" type="button" disabled={busy} onClick={() => void reviewManagerRequest(request, true)}>
                            <CheckCircle2 size={16} />
                            Согласовать и передать в HR
                          </button>
                        </div>
                      </div>
                    )}

                    {role === "hr" && request.status === "На рассмотрении" && request.workflow_stage === "hr" && (
                      <div className="hr-review">
                        <label htmlFor={`hr-${request.id}`}>Комментарий HR</label>
                        <textarea
                          id={`hr-${request.id}`}
                          rows={2}
                          value={reviewComments[request.id] ?? ""}
                          onChange={(event) => setReviewComments((current) => ({ ...current, [request.id]: event.target.value }))}
                          placeholder="Условия, замечания или причина отказа..."
                        />
                        <div className="form-actions">
                          <button className="secondary-button" type="button" disabled={busy} onClick={() => void reviewRequest(request, "Отклонена")}>Отклонить</button>
                          <button className="primary-button" type="button" disabled={busy} onClick={() => void reviewRequest(request, "Одобрена")}>
                            <CheckCircle2 size={16} />
                            Одобрить и подписать
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="request-controls"><StatusLabel status={request.status} workflowStage={request.workflow_stage} /></div>
                </article>
              ))}
            </div>
          )}
        </section>

        {calendarError && <div className="notice-message" role="alert"><span>{calendarError}</span></div>}
        <section className="lower-grid">
          <UpcomingEvents events={events} people={people} onOpen={() => scrollToSection("calendar")} />
        </section>

        <CalendarSection events={events} people={people} isHr={role === "hr"} onChanged={reloadCalendar} notify={notify} />

        <section className="lower-grid">
          <div className="lower-col">
            <PulseCard onAskAI={() => scrollToSection("assistant")} />
            <Academy key={session.user.id} session={session} />
          </div>

          <article className="content-card spot" id="assistant">
            <div className="section-heading">
              <div>
                <h2>HR-ассистент</h2>
                <p>Помощь с кадровыми вопросами.</p>
              </div>
              <ClipboardCheck size={22} />
            </div>
            <AssistantPanel requestLines={roleVisibleRequests.filter((r) => role === "hr" || r.user_id === session.user.id).slice(0, 8).map(describeRequest)} />
          </article>
        </section>

        <footer className="page-footer">
          JanaМен · Заявки проходят согласование по цепочке сотрудник → руководитель → HR
        </footer>
      </main>
    </div>
  );
}
