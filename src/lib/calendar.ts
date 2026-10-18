import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type EventKind = "company" | "meeting" | "training" | "holiday";
export type CalendarEvent = {
  id: string;
  title: string;
  description: string;
  event_date: string; // YYYY-MM-DD
  event_time: string | null;
  kind: EventKind;
};
export type Person = { user_id: string; display_name: string; birth_date: string | null; role: string };
export type DayItem = { key: string; title: string; subtitle: string; date: string; kind: EventKind | "birthday"; eventId?: string };

export const KIND_LABEL: Record<EventKind | "birthday", string> = {
  company: "Событие компании", meeting: "Встреча", training: "Обучение", holiday: "Праздник", birthday: "День рождения",
};

export function toIso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** События + дни рождения (пересчитанные на год каждой даты) в единый список по дате. */
export function buildItems(events: CalendarEvent[], people: Person[], years: number[]): DayItem[] {
  const items: DayItem[] = events.map((e) => ({
    key: e.id, eventId: e.id, title: e.title, date: e.event_date, kind: e.kind,
    subtitle: [e.event_time, e.description].filter(Boolean).join(" · "),
  }));
  for (const p of people) {
    if (!p.birth_date) continue;
    const [, m, d] = p.birth_date.split("-");
    for (const y of years) {
      items.push({ key: `b-${p.user_id}-${y}`, title: `День рождения: ${p.display_name}`, subtitle: "", date: `${y}-${m}-${d}`, kind: "birthday" });
    }
  }
  return items.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export function useCalendarData(session: Session | null) {
  const [loadedData, setLoadedData] = useState<{
    userId: string;
    events: CalendarEvent[];
    people: Person[];
    error: string;
  } | null>(null);

  const reload = useCallback(async () => {
    // При выходе не запускаем запрос и не вызываем setState синхронно.
    // Данные предыдущего пользователя скрываются ниже по userId.
    if (!session) return;
    const userId = session.user.id;
    const [ev, dir] = await Promise.all([
      supabase.from("events").select("id,title,description,event_date,event_time,kind").order("event_date"),
      supabase.rpc("janamen_directory"),
    ]);
    if (ev.error || dir.error) {
      setLoadedData({
        userId,
        events: [],
        people: [],
        error: `Календарь недоступен: ${(ev.error ?? dir.error)?.message}. Выполните миграцию 20261017_janamen_calendar.sql.`,
      });
      return;
    }
    setLoadedData({
      userId,
      events: (ev.data ?? []) as CalendarEvent[],
      people: (dir.data ?? []) as Person[],
      error: "",
    });
  }, [session]);

  useEffect(() => {
    if (!session) return;
    let active = true;
    // Начинаем сетевую загрузку в следующем microtask; она не меняет состояние
    // синхронно в момент выполнения эффекта.
    void Promise.resolve().then(() => {
      if (active) return reload();
      return undefined;
    });
    const channel = supabase.channel("janamen-events")
      .on("postgres_changes", { event: "*", schema: "public", table: "events" }, () => void reload())
      .subscribe();
    return () => {
      active = false;
      void supabase.removeChannel(channel);
    };
  }, [session, reload]);

  const visibleData = session && loadedData?.userId === session.user.id ? loadedData : null;
  return {
    events: visibleData?.events ?? [],
    people: visibleData?.people ?? [],
    error: visibleData?.error ?? "",
    reload,
  };
}
