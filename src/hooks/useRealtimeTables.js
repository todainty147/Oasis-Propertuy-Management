import { useEffect, useMemo, useRef } from "react";
import { supabase } from "../lib/supabase";

export function useRealtimeTables({
  enabled = true,
  subscriptions = [],
  onChange,
  debounceMs = 150,
} = {}) {
  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const signature = useMemo(
    () =>
      JSON.stringify(
        (subscriptions || []).map((sub) => ({
          channel: sub?.channel || "",
          schema: sub?.schema || "public",
          table: sub?.table || "",
          event: sub?.event || "*",
          filter: sub?.filter || "",
        })),
      ),
    [subscriptions],
  );

  useEffect(() => {
    if (
      !enabled ||
      typeof onChangeRef.current !== "function" ||
      !Array.isArray(subscriptions) ||
      subscriptions.length === 0
    ) {
      return undefined;
    }

    let timeoutId = 0;
    const channels = [];

    const trigger = () => {
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        onChangeRef.current?.();
      }, debounceMs);
    };

    for (const sub of subscriptions) {
      if (!sub?.table) continue;

      const channel = supabase
        .channel(
          sub.channel ||
            `rt:${sub.schema || "public"}:${sub.table}:${sub.filter || "all"}`,
        )
        .on(
          "postgres_changes",
          {
            event: sub.event || "*",
            schema: sub.schema || "public",
            table: sub.table,
            ...(sub.filter ? { filter: sub.filter } : {}),
          },
          trigger,
        )
        .subscribe();

      channels.push(channel);
    }

    return () => {
      window.clearTimeout(timeoutId);
      for (const channel of channels) {
        supabase.removeChannel(channel);
      }
    };
  }, [debounceMs, enabled, signature]);
}
