import { useMemo, useState, type FormEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Cake, Trash2 } from "lucide-react";
import { supabase } from "../lib/supabase";
import { KIND_LABEL, buildItems, toIso, type CalendarEvent, type DayItem, type EventKind, type Person } from "../lib/calendar";
import { ScenicBanner, EmptyArt } from "./Art";
import "./Calendar.css";

const MONTHS = ["Январь","Февраль","Март","Апрель","Май","Июнь","Июль","Август","Сентябрь","Октябрь","Ноябрь","Декабрь"];
const WEEKDAYS = ["Пн","Вт","Ср","Чт","Пт","Сб","Вс"];

/** Блок «Ближайшие события» для главной — те же данные, что и в календаре. */
export function UpcomingEvents({ events, people, onOpen }: { events: CalendarEvent[]; people: Person[]; onOpen: () => void }) {
  const items = useMemo(() => {
    const now = new Date();
    const today = toIso(now);
    return buildItems(events, people, [now.getFullYear(), now.getFullYear() + 1]).filter((i) => i.date >= today).slice(0, 5);
  }, [events, people]);
  return (
    <article className="content-card spot" id="upcoming">
      <div className="section-heading">
        <div><h2>Ближайшие события</h2><p>События компании и дни рождения коллег.</p></div>
        <CalendarDays size={23} />
      </div>
      {items.length === 0 ? <div className="cal-empty"><EmptyArt />Ближайших событий нет.</div> : (
        <ul className="cal-upcoming">
          {items.map((i) => (
            <li key={i.key}>
              <span className={`cal-badge cal-${i.kind}`}>{new Date(i.date + "T00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}</span>
              <div><strong>{i.title}</strong>{i.subtitle && <small>{i.subtitle}</small>}</div>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="cal-link" onClick={onOpen}>Открыть календарь →</button>
    </article>
  );
}

export default function CalendarSection({ events, people, isHr, onChanged, notify }: {
  events: CalendarEvent[]; people: Person[]; isHr: boolean; onChanged: () => Promise<void>; notify: (m: string) => void;
}) {
  const [cursor, setCursor] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [selected, setSelected] = useState(toIso(new Date()));
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState("");
  const [time, setTime] = useState(""); const [kind, setKind] = useState<EventKind>("company");
  const [personId, setPersonId] = useState(""); const [personName, setPersonName] = useState(""); const [personBirth, setPersonBirth] = useState("");
  const [busy, setBusy] = useState(false);

  const year = cursor.getFullYear(), month = cursor.getMonth();
  const byDate = useMemo(() => {
    const map = new Map<string, DayItem[]>();
    for (const i of buildItems(events, people, [year])) map.set(i.date, [...(map.get(i.date) ?? []), i]);
    return map;
  }, [events, people, year]);

  const offset = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, d) => toIso(new Date(year, month, d + 1)))];
  const todayIso = toIso(new Date());
  const selectedItems = byDate.get(selected) ?? [];

  async function addEvent(e: FormEvent) {
    e.preventDefault();
    if (!isHr || !title.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("events").insert({ title: title.trim(), description: desc.trim(), event_date: selected, event_time: time || null, kind });
    setBusy(false);
    if (error) { notify(`Не удалось добавить событие: ${error.message}`); return; }
    setTitle(""); setDesc(""); setTime(""); notify("Событие добавлено и доступно всем сотрудникам.");
    await onChanged();
  }
  async function removeEvent(id: string) {
    if (!isHr || !window.confirm("Удалить событие?")) return;
    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) { notify(`Не удалось удалить: ${error.message}`); return; }
    await onChanged();
  }
  async function savePerson(e: FormEvent) {
    e.preventDefault();
    if (!isHr || !personId) return;
    const { error } = await supabase.rpc("janamen_set_person_info", { p_user_id: personId, p_full_name: personName, p_birth_date: personBirth || null });
    if (error) { notify(`Не удалось сохранить: ${error.message}`); return; }
    notify("Данные сотрудника сохранены."); await onChanged();
  }

  return (
    <section className="content-card spot cal-section" id="calendar">
      <div className="section-heading">
        <div><h2>Календарь событий</h2><p>Общий календарь компании и дни рождения.</p></div>
        <CalendarDays size={23} />
      </div>
      <ScenicBanner />
      <div className="cal-layout">
        <div>
          <div className="cal-nav">
            <button type="button" aria-label="Предыдущий месяц" onClick={() => setCursor(new Date(year, month - 1, 1))}><ChevronLeft size={18} /></button>
            <strong>{MONTHS[month]} {year}</strong>
            <button type="button" aria-label="Следующий месяц" onClick={() => setCursor(new Date(year, month + 1, 1))}><ChevronRight size={18} /></button>
          </div>
          <div className="cal-grid">
            {WEEKDAYS.map((w) => <div key={w} className="cal-wd">{w}</div>)}
            {cells.map((iso, i) => iso ? (
              <button type="button" key={iso} className={`cal-day${iso === selected ? " sel" : ""}${iso === todayIso ? " today" : ""}`} onClick={() => setSelected(iso)}>
                <span>{Number(iso.slice(8))}</span>
                <span className="cal-dots">{(byDate.get(iso) ?? []).slice(0, 3).map((x) => <i key={x.key} className={`cal-${x.kind}`} />)}</span>
              </button>
            ) : <div key={`e${i}`} />)}
          </div>
        </div>
        <div className="cal-side">
          <h3>{new Date(selected + "T00:00").toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}</h3>
          {selectedItems.length === 0 ? <p className="cal-empty">В этот день событий нет.</p> : (
            <ul className="cal-list">
              {selectedItems.map((i) => (
                <li key={i.key}>
                  <span className={`cal-badge cal-${i.kind}`}>{i.kind === "birthday" ? <Cake size={13} /> : KIND_LABEL[i.kind]}</span>
                  <div><strong>{i.title}</strong>{i.subtitle && <small>{i.subtitle}</small>}</div>
                  {isHr && i.eventId && <button type="button" className="cal-del" aria-label="Удалить" onClick={() => void removeEvent(i.eventId!)}><Trash2 size={15} /></button>}
                </li>
              ))}
            </ul>
          )}
          {isHr ? (
            <>
              <form className="cal-form" onSubmit={addEvent}>
                <h4>Новое событие на выбранную дату (только HR)</h4>
                <input required maxLength={200} placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
                <div className="cal-row">
                  <select value={kind} onChange={(e) => setKind(e.target.value as EventKind)}>
                    {(["company","meeting","training","holiday"] as EventKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                  </select>
                  <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
                </div>
                <input placeholder="Описание (необязательно)" value={desc} onChange={(e) => setDesc(e.target.value)} />
                <button className="primary-button" disabled={busy} type="submit">{busy ? "Сохраняем..." : "Добавить"}</button>
              </form>
              <form className="cal-form" onSubmit={savePerson}>
                <h4>Имя и дата рождения сотрудника</h4>
                <select required value={personId} onChange={(e) => {
                  const p = people.find((x) => x.user_id === e.target.value);
                  setPersonId(e.target.value); setPersonName(p?.display_name ?? ""); setPersonBirth(p?.birth_date ?? "");
                }}>
                  <option value="">Выберите сотрудника</option>
                  {people.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name} ({p.role})</option>)}
                </select>
                <input placeholder="Имя Фамилия" value={personName} onChange={(e) => setPersonName(e.target.value)} />
                <input type="date" value={personBirth} onChange={(e) => setPersonBirth(e.target.value)} />
                <button className="primary-button" type="submit">Сохранить</button>
              </form>
            </>
          ) : <p className="cal-hint">Добавлять события может только HR.</p>}
        </div>
      </div>
    </section>
  );
}
