// src/hooks/useOperatingCalendar.js
import { useState, useEffect, useCallback } from "react";
import { useAccount } from "../context/AccountContext";
import { getOperatingCalendar } from "../services/operatingCalendarService";

function toISODate(d) {
  if (!d) return null;
  return d instanceof Date ? d.toISOString().slice(0, 10) : String(d);
}

export function useOperatingCalendar({
  enabled = true,
  startDate = null,
  endDate = null,
  propertyId = null,
  sourceModule = null,
  urgency = null,
  status = null,
} = {}) {
  const { activeAccountId } = useAccount();
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError]     = useState(null);

  const load = useCallback(async () => {
    if (!enabled || !activeAccountId || !startDate || !endDate) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await getOperatingCalendar({
        accountId:    activeAccountId,
        startDate:    toISODate(startDate),
        endDate:      toISODate(endDate),
        propertyId:   propertyId   ?? null,
        sourceModule: sourceModule ?? null,
        urgency:      urgency      ?? null,
        status:       status       ?? null,
      });
      setItems(data);
    } catch (err) {
      console.error("[useOperatingCalendar]", err);
      setError(err);
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [enabled, activeAccountId, startDate, endDate, propertyId, sourceModule, urgency, status]);

  useEffect(() => {
    load();
  }, [load]);

  return { items, loading, error, refetch: load };
}
