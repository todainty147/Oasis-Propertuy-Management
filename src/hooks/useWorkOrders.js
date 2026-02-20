// src/hooks/useWorkOrders.js
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useAccount } from "../context/AccountContext";
import { fetchWorkOrders } from "../services/workOrderService";

export function useWorkOrders({
  enabled = true,
  propertyId = null,
  maintenanceRequestId = null,

  // ✅ keep existing behavior
  limit = 50,

  // ✅ new (optional) pagination inputs
  page: pageProp = null,        // if null => old behavior (no pagination)
  pageSize: pageSizeProp = 20,  // used only when pageProp is not null
} = {}) {
  const { activeAccountId } = useAccount();

  const [workOrders, setWorkOrders] = useState([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState(null);

  // ✅ internal pagination state (only used if consumer doesn't control it)
  const [pageState, setPageState] = useState(1);
  const [pageSizeState, setPageSizeState] = useState(pageSizeProp);

  // if consumer passes page => controlled, else uncontrolled
  const paginationEnabled = pageProp !== null && pageProp !== undefined;
  const page = paginationEnabled ? pageProp : pageState;
  const pageSize = paginationEnabled ? pageSizeProp : pageSizeState;

  // ✅ new totals (only meaningful when pagination is enabled)
  const [total, setTotal] = useState(0);

  const totalPages = useMemo(() => {
    if (!paginationEnabled) return 1;
    return Math.max(1, Math.ceil((total || 0) / (pageSize || 1)));
  }, [paginationEnabled, total, pageSize]);

  const hasPrev = paginationEnabled ? page > 1 : false;
  const hasNext = paginationEnabled ? page < totalPages : false;

  const load = useCallback(async () => {
    if (!enabled || !activeAccountId || !propertyId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ✅ Backward compatible:
      // - if pagination disabled => fetchWorkOrders behaves same as before (returns array)
      // - if enabled => fetchWorkOrders should return { data, count }
      const res = await fetchWorkOrders({
        accountId: activeAccountId,
        propertyId,
        maintenanceRequestId,

        // old behavior
        limit,

        // new behavior
        page: paginationEnabled ? page : undefined,
        pageSize: paginationEnabled ? pageSize : undefined,
      });

      if (paginationEnabled) {
        const data = res?.data ?? [];
        const count = res?.count ?? 0;
        setWorkOrders(data);
        setTotal(count);
      } else {
        setWorkOrders(Array.isArray(res) ? res : res?.data ?? []);
        // keep total at 0 in non-paginated mode (unused)
        setTotal(0);
      }
    } catch (e) {
      setError(e);
      setWorkOrders([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [
    enabled,
    activeAccountId,
    propertyId,
    maintenanceRequestId,
    limit,
    paginationEnabled,
    page,
    pageSize,
  ]);

  // ✅ Reset page when property / maintenance changes (pagination mode only)
  useEffect(() => {
    if (!paginationEnabled) return;
    // if consumer is controlling pageProp, we don't touch it
    if (pageProp !== null && pageProp !== undefined) return;
    setPageState(1);
  }, [paginationEnabled, pageProp, propertyId, maintenanceRequestId]);

  useEffect(() => {
    if (!enabled || !activeAccountId || !propertyId) {
      setLoading(false);
      return;
    }

    let channel;

    load();

    // ✅ Filter realtime by account + property to avoid reload spam
    channel = supabase
      .channel(`work-orders-${activeAccountId}-${propertyId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "work_orders",
          filter: `account_id=eq.${activeAccountId},property_id=eq.${propertyId}`,
        },
        // ✅ In paginated mode, a change may affect totals/pages.
        // We reload current page (safe + minimal).
        load
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [enabled, activeAccountId, propertyId, load]);

  // ✅ If page goes out of bounds after deletes, clamp (uncontrolled mode)
  useEffect(() => {
    if (!paginationEnabled) return;
    if (pageProp !== null && pageProp !== undefined) return; // controlled
    if (pageState > totalPages) setPageState(totalPages);
  }, [paginationEnabled, pageProp, pageState, totalPages]);

  return {
    workOrders,
    loading,
    error,
    reload: load,

    // ✅ new outputs (won’t break existing consumers)
    paginationEnabled,
    page,
    pageSize,
    total,
    totalPages,
    hasPrev,
    hasNext,
    setPage: paginationEnabled
      ? (pageProp !== null && pageProp !== undefined ? undefined : setPageState)
      : undefined,
    setPageSize: paginationEnabled
      ? (pageProp !== null && pageProp !== undefined ? undefined : setPageSizeState)
      : undefined,
  };
}