import { useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { CourseArt } from "./Art";

type Step = { lesson: string; question: string; options: string[]; correct: number; explain: string };
type Course = { id: string; title: string; subtitle: string; art: "shield" | "building"; steps: Step[] };
type Progress = { step: number; score: number; completed: boolean };

const COURSES: Course[] = [
  {
    id: "intro", title: "Введение в компанию", subtitle: "Знакомство с командой и процессами", art: "building",
    steps: [
      { lesson: "Заявки на отпуск, аванс и справки подаются через портал. Сотрудник отправляет заявку руководителю, тот согласует и передаёт HR.", question: "Кто принимает итоговое решение по заявке?", options: ["Руководитель", "HR", "Коллега по отделу"], correct: 1, explain: "Руководитель согласует первым этапом, финальное решение и подпись — за HR." },
      { lesson: "Ежегодный оплачиваемый отпуск списывается с вашего остатка дней. Отпуск без сохранения заработной платы остаток не уменьшает.", question: "Уменьшает ли отпуск без содержания остаток оплачиваемых дней?", options: ["Да", "Нет", "Только если больше 7 дней"], correct: 1, explain: "Остаток оплачиваемых дней расходует только оплачиваемый отпуск." },
      { lesson: "Общие события компании и дни рождения коллег находятся в календаре портала. Добавлять события может только HR.", question: "Где посмотреть ближайшие события компании?", options: ["В календаре портала", "Только в чате", "В профиле руководителя"], correct: 0, explain: "Календарь и блок «Ближайшие события» на главной берут данные из одного источника." },
    ],
  },
  {
    id: "infosec", title: "Информационная безопасность", subtitle: "Основы безопасной работы", art: "shield",
    steps: [
      { lesson: "Пароль должен быть длинным и уникальным для каждого сервиса. Менеджер паролей помогает не повторять их.", question: "Какой пароль надёжнее?", options: ["Jana2024", "Фраза из 4–5 случайных слов", "Дата рождения"], correct: 1, explain: "Длинная фраза из случайных слов сложнее подобрать и проще запомнить." },
      { lesson: "Фишинговые письма создают срочность и просят перейти по ссылке или ввести пароль. Проверяйте адрес отправителя и ссылку.", question: "Вам пришло письмо «срочно подтвердите пароль по ссылке». Что делать?", options: ["Перейти и ввести пароль", "Не переходить, сообщить в ИТ/ИБ", "Переслать коллегам"], correct: 1, explain: "Не вводите данные по ссылке из письма и сообщите об этом специалистам." },
      { lesson: "Включите двухфакторную аутентификацию там, где это возможно. Не оставляйте разблокированный компьютер без присмотра.", question: "Зачем нужна двухфакторная аутентификация?", options: ["Ускоряет вход", "Защищает аккаунт, даже если пароль узнали", "Заменяет пароль полностью"], correct: 1, explain: "Второй фактор не даёт войти только по украденному паролю." },
    ],
  },
];

const localKey = (uid: string, id: string) => `janamen-course-${uid}-${id}`;

function readLocalProgress(uid: string): Record<string, Progress> {
  const local: Record<string, Progress> = {};
  for (const course of COURSES) {
    try {
      const raw = localStorage.getItem(localKey(uid, course.id));
      if (raw) local[course.id] = JSON.parse(raw) as Progress;
    } catch {
      // При недоступности localStorage используем пустой локальный прогресс.
    }
  }
  return local;
}

export default function Academy({ session }: { session: Session }) {
  const uid = session.user.id;
  const [progress, setProgress] = useState<Record<string, Progress>>(() => readLocalProgress(uid));
  const [openId, setOpenId] = useState<string | null>(null);
  const [picked, setPicked] = useState<number | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    void supabase.from("course_progress").select("course_id,step,score,completed").then(({ data, error }) => {
      if (cancelled || error || !data) return;
      setProgress((current) => {
        const next = { ...current };
        for (const row of data as { course_id: string; step: number; score: number; completed: boolean }[]) {
          next[row.course_id] = { step: row.step, score: row.score, completed: row.completed };
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [uid]);

  async function save(courseId: string, p: Progress) {
    setProgress((cur) => ({ ...cur, [courseId]: p }));
    try { localStorage.setItem(localKey(uid, courseId), JSON.stringify(p)); } catch { /* ignore */ }
    const { error } = await supabase.from("course_progress").upsert({ user_id: uid, course_id: courseId, step: p.step, score: p.score, completed: p.completed, updated_at: new Date().toISOString() });
    setNote(error ? "Прогресс сохранён только на этом устройстве (выполните SQL-миграцию для общего хранения)." : "");
  }

  const course = COURSES.find((c) => c.id === openId) ?? null;
  const cur = course ? progress[course.id] ?? { step: 0, score: 0, completed: false } : null;
  const stepIdx = course && cur ? Math.min(cur.step, course.steps.length - 1) : 0;

  function start(c: Course) {
    const p = progress[c.id];
    setPicked(null); setOpenId(c.id);
    if (!p || p.completed) void save(c.id, { step: 0, score: 0, completed: false });
  }
  async function answer(i: number) {
    if (!course || !cur || picked !== null) return;
    setPicked(i);
  }
  async function next() {
    if (!course || !cur || picked === null) return;
    const s = course.steps[stepIdx];
    const score = cur.score + (picked === s.correct ? 1 : 0);
    const step = stepIdx + 1;
    setPicked(null);
    await save(course.id, { step, score, completed: step >= course.steps.length });
  }

  return (
    <article className="content-card spot" id="academy">
      <div className="section-heading">
        <div><h2>Jana Academy</h2><p>Мини-курсы с проверкой знаний. Прогресс сохраняется.</p></div>
        <GraduationCap size={23} />
      </div>
      {note && <p className="cal-hint">{note}</p>}
      {course && cur && !cur.completed && (
        <div className="acad-quiz">
          <h4>{course.title} · шаг {stepIdx + 1} из {course.steps.length}</h4>
          <p>{course.steps[stepIdx].lesson}</p>
          <strong>{course.steps[stepIdx].question}</strong>
          <div className="acad-opts">
            {course.steps[stepIdx].options.map((o, i) => {
              const s = course.steps[stepIdx];
              const cls = picked === null ? "" : i === s.correct ? " ok" : i === picked ? " bad" : "";
              return <button key={o} type="button" disabled={picked !== null} className={`acad-opt${cls}`} onClick={() => void answer(i)}>{o}</button>;
            })}
          </div>
          {picked !== null && (
            <>
              <div className="acad-expl">{picked === course.steps[stepIdx].correct ? "Верно! " : "Не совсем. "}{course.steps[stepIdx].explain}</div>
              <p><button type="button" className="acad-btn" onClick={() => void next()}>{stepIdx + 1 >= course.steps.length ? "Завершить" : "Дальше"}</button></p>
            </>
          )}
        </div>
      )}
      {course && cur?.completed && (
        <div className="acad-quiz">
          <h4>Курс пройден 🎉</h4>
          <p>Результат: {cur.score} из {course.steps.length}. Он сохранён в вашем профиле.</p>
          <button type="button" className="acad-btn" onClick={() => setOpenId(null)}>Закрыть</button>
        </div>
      )}
      {COURSES.map((c) => {
        const p = progress[c.id];
        const pct = p ? Math.round((Math.min(p.step, c.steps.length) / c.steps.length) * 100) : 0;
        return (
          <div className="acad-card" key={c.id}>
            <CourseArt variant={c.art} />
            <div className="acad-info">
              <strong>{c.title}</strong><span>{c.subtitle}</span>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${pct}%` }} /></div>
              <small>{p?.completed ? `Пройден: ${p.score}/${c.steps.length}` : `Прогресс: ${pct}%`}</small>
            </div>
            <button type="button" className={`acad-btn${p?.completed ? " ghost" : ""}`} onClick={() => start(c)}>
              {p?.completed ? "Пройти снова" : p && p.step > 0 ? "Продолжить" : "Начать"}
            </button>
          </div>
        );
      })}
    </article>
  );
}
