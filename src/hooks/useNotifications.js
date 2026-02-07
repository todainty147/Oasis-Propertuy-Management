// src/hooks/useNotifications.js
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";

/**
 * Notifications v1 hook (hardened)
 * - Reads notifications (RLS: only recipient can read/update)
 * - Unread count
 * - Mark single / all read
 * - Realtime (debounced) without causing render loops
 */
export function useNotifications({ limit = 20, accountId = null } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const mountedRef = useRef(true);

  // Debounce refetch bursts from realtime (and avoid loops)
  const refetchTimerRef = useRef(null);
  const scheduleRefetch = useCallback(
    (ms = 250) => {
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = setTimeout(() => {
        refetchTimerRef.current = null;
        fetchNotificationsRef.current?.();
      }, ms);
    },
    [] // constant
  );

  // Keep the fetch function in a ref so effects don't depend on it
  const fetchNotificationsRef = useRef(null);

  const unreadCount = useMemo(
    () => items.reduce((acc, n) => acc + (n.is_read ? 0 : 1), 0),
    [items]
  );

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let q = supabase
        .from("notifications")
        .select(
          "id, account_id, type, title, body, entity_type, entity_id, link_path, metadata, is_read, read_at, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(limit);

      // Optional scoping (useful when switching accounts)
      if (accountId) q = q.eq("account_id", accountId);

      const { data, error: e } = await q;

      if (!mountedRef.current) return;

      if (e) {
        setError(e);
        setItems([]);
      } else {
        setItems(data ?? []);
      }
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [limit, accountId]);

  // Keep latest fetch in ref for debounced realtime callback
  useEffect(() => {
    fetchNotificationsRef.current = fetchNotifications;
  }, [fetchNotifications]);

  const markRead = useCallback(
    async (id) => {
      if (!id) return;

      // Optimistic update
      const nowIso = new Date().toISOString();
      setItems((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: nowIso } : n))
      );

      const { error: e } = await supabase
        .from("notifications")
        .update({ is_read: true, read_at: nowIso })
        .eq("id", id);

      if (e) {
        // rollback
        await fetchNotificationsRef.current?.();
        throw e;
      }
    },
    [] // constant
  );

  const markAllRead = useCallback(async () => {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const nowIso = new Date().toISOString();

    // Optimistic update
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true, read_at: nowIso })));

    // Fast path: single UPDATE with IN (...)
    const { error: e } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: nowIso })
      .in("id", unreadIds);

    if (e) {
      await fetchNotificationsRef.current?.();
      throw e;
    }
  }, [items]);

  // Initial fetch + on account/limit changes
  useEffect(() => {
    mountedRef.current = true;
    fetchNotifications();
    return () => {
      mountedRef.current = false;
      if (refetchTimerRef.current) clearTimeout(refetchTimerRef.current);
      refetchTimerRef.current = null;
    };
  }, [fetchNotifications]);

  // Realtime subscription (debounced). Avoid triggering a tight loop.
  useEffect(() => {
    // If you don't have Realtime enabled for this table, this just won't fire.
    const channel = supabase
      .channel(`notifications-changes-${accountId || "all"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications" },
        (payload) => {
          // Optional: scope bursts. If accountId is set, ignore other accounts.
          if (accountId) {
            const row = payload?.new ?? payload?.old;
            if (row?.account_id && row.account_id !== accountId) return;
          }

          // Avoid immediate refetch storms; debounce
          scheduleRefetch(250);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [accountId, scheduleRefetch]);

  return {
    items,
    loading,
    error,
    unreadCount,
    refetch: fetchNotifications,
    markRead,
    markAllRead,
  };
}
