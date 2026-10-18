import { useEffect, useMemo, useState } from "react";
import { Flame, HeartPulse, MessageCircleHeart, TrendingUp } from "lucide-react";
import "./PulseCard.css";

type Mood = 1 | 2 | 3 | 4 | 5;
type PulseLog = Record<string, Mood>;

const STORAGE_KEY = "janamen-pulse";

const moods: { value: Mood; emoji: string; label: string; tip: string }[] = [
  { value: 1, emoji: "😣", label: "Тяжело", tip: "Бывает. Сделайте паузу, выпейте воды и разбейте день на маленькие шаги." },
  { value: 2, emoji: "😕", label: "Так себе", tip: "Выберите одну небольшую задачу и закройте её — станет легче." },
  { value: 3, emoji: "🙂", label: "Нормально", tip: "Ровный день — хорошее время разобрать накопившиеся мелочи." },
  { value: 4, emoji: "😄", label: "Хорошо", tip: "Отличный настрой! Поделитесь им с командой." },
  { value: 5, emoji: "🤩", label: "Огонь", tip: "Вы на волне — самое время взяться за что-то амбициозное." },
];

function dayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function readLog(): PulseLog {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed: unknown = JSON.parse(saved);
      if (parsed && typeof parsed === "object") return parsed as PulseLog;
    }
  } catch {
    // Повреждённые данные просто игнорируем.
  }
  return {};
}

function lastDays(count: number): Date[] {
  const days: Date[] = [];
  const now = new Date();
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    days.push(d);
  }
  return days;
}

type Props = {
  onAskAI: () => void;
};

export default function PulseCard({ onAskAI }: Props) {
  const [log, setLog] = useState<PulseLog>(readLog);
  const [burst, setBurst] = useState(0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(log));
  }, [log]);

  const today = dayKey(new Date());
  const todayMood = log[today];
  const week = useMemo(() => lastDays(7), []);

  const streak = useMemo(() => {
    let count = 0;
    const cursor = new Date();
    // Если сегодня ещё не отмечено, серия считается со вчерашнего дня.
    if (!log[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
    while (log[dayKey(cursor)]) {
      count += 1;
      cursor.setDate(cursor.getDate() - 1);
    }
    return count;
  }, [log]);

  const weekValues = week.map((d) => log[dayKey(d)]).filter((v): v is Mood => v !== undefined);
  const average = weekValues.length
    ? (weekValues.reduce<number>((sum, v) => sum + v, 0) / weekValues.length).toFixed(1)
    : "—";

  const selected = moods.find((m) => m.value === todayMood);

  function choose(value: Mood) {
    setLog((current) => ({ ...current, [today]: value }));
    setBurst((n) => n + 1);
  }

  return (
    <article className="content-card pulse-card spot" id="pulse">
      <div className="section-heading">
        <div>
          <span className="pulse-kicker">
            <HeartPulse size={13} /> JANA PULSE
          </span>
          <h2>Как вы сегодня?</h2>
          <p>Отметьте настроение за 5 секунд — и следите за своей неделей.</p>
        </div>
        <div className="pulse-streak" title="Дней подряд с отметкой">
          <Flame size={18} />
          <strong>{streak}</strong>
          <span>{streak === 1 ? "день" : streak >= 2 && streak <= 4 ? "дня" : "дней"}</span>
        </div>
      </div>

      <div className="mood-row" role="radiogroup" aria-label="Ваше настроение сегодня">
        {moods.map((mood) => (
          <button
            key={mood.value}
            type="button"
            role="radio"
            aria-checked={todayMood === mood.value}
            className={`mood-button mood-${mood.value}${todayMood === mood.value ? " selected" : ""}`}
            onClick={() => choose(mood.value)}
          >
            <span className="mood-emoji" key={todayMood === mood.value ? burst : "idle"}>
              {mood.emoji}
            </span>
            <span className="mood-label">{mood.label}</span>
          </button>
        ))}
      </div>

      <div className="pulse-tip" aria-live="polite">
        {selected ? (
          <>
            <MessageCircleHeart size={18} />
            <p>{selected.tip}</p>
            {selected.value <= 2 && (
              <button type="button" className="pulse-ai-button" onClick={onAskAI}>
                Спросить Jana AI
              </button>
            )}
          </>
        ) : (
          <p className="pulse-tip-empty">Выберите смайлик — Jana Pulse запомнит ваш день.</p>
        )}
      </div>

      <div className="week-head">
        <span>
          <TrendingUp size={14} /> Неделя
        </span>
        <span>Среднее: <strong>{average}</strong></span>
      </div>

      <div className="week-chart">
        {week.map((d, index) => {
          const value = log[dayKey(d)];
          const isToday = dayKey(d) === today;
          return (
            <div className={`week-col${isToday ? " today" : ""}`} key={dayKey(d)}>
              <div className="week-bar-wrap">
                <div
                  className={`week-bar${value ? ` mood-${value}` : " empty"}`}
                  style={{ height: value ? `${value * 20}%` : "8%", animationDelay: `${index * 70}ms` }}
                  title={value ? moods[value - 1].label : "Нет отметки"}
                />
              </div>
              <span>{d.toLocaleDateString("ru-RU", { weekday: "short" })}</span>
            </div>
          );
        })}
      </div>

      <p className="pulse-note">Демо: отметки хранятся только в этом браузере и никому не передаются.</p>
    </article>
  );
}