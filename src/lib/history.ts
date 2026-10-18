import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type HistoryItem = { id: number; request_id: string; event: string; status: string | null; comment: string; created_at: string };

/** История статусов по заявкам; перечитывается, когда меняется список заявок. */
export function useRequestHistory(session: Session | null, signature: string) {
  const [loadedHistory, setLoadedHistory] = useState<{
    userId: string;
    map: Record<string, HistoryItem[]>;
  } | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const userId = session.user.id;
    void supabase.from("request_history").select("id,request_id,event,status,comment,created_at").order("created_at").then(({ data, error }) => {
      if (cancelled || error) return; // таблицы может ещё не быть — история просто не покажется
      const next: Record<string, HistoryItem[]> = {};
      for (const row of (data ?? []) as HistoryItem[]) (next[row.request_id] ??= []).push(row);
      setLoadedHistory({ userId, map: next });
    });
    return () => { cancelled = true; };
  }, [session, signature]);

  // После выхода/смены аккаунта не показываем историю предыдущего пользователя,
  // не очищая состояние синхронным setState внутри эффекта.
  return session && loadedHistory?.userId === session.user.id ? loadedHistory.map : {};
}
