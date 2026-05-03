import { useCallback, useEffect, useState } from "react";
import { listTaxItems } from "../services/taxReadinessService";

export function useTaxReadiness(accountId, { jurisdiction = null } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accountId) {
      setItems([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError("");
      const data = await listTaxItems(accountId, { jurisdiction });
      setItems(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tax items");
    } finally {
      setLoading(false);
    }
  }, [accountId, jurisdiction]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!accountId) {
        setItems([]);
        setLoading(false);
        return;
      }
      try {
        setLoading(true);
        setError("");
        const data = await listTaxItems(accountId, { jurisdiction });
        if (!cancelled) setItems(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load tax items");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [accountId, jurisdiction]);

  return { items, loading, error, refetch: load };
}
