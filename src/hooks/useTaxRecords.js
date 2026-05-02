import { useCallback, useEffect, useState } from "react";
import { listTaxRecords } from "../services/taxRecordsService";

const PAGE_SIZE = 100;

export function useTaxRecords(accountId, {
  countryCode = null,
  recordType = null,
  reviewStatus = null,
} = {}) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  const load = useCallback(async () => {
    if (!accountId) { setRecords([]); setLoading(false); return; }
    try {
      setLoading(true);
      setError("");
      const data = await listTaxRecords(accountId, {
        countryCode, recordType, reviewStatus,
        limit: PAGE_SIZE, offset: 0,
      });
      setRecords(data);
      setHasMore(data.length === PAGE_SIZE);
      setOffset(data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load tax records");
    } finally {
      setLoading(false);
    }
  }, [accountId, countryCode, recordType, reviewStatus]);

  const loadMore = useCallback(async () => {
    if (!accountId || loading) return;
    try {
      setLoading(true);
      const data = await listTaxRecords(accountId, {
        countryCode, recordType, reviewStatus,
        limit: PAGE_SIZE, offset,
      });
      setRecords((prev) => [...prev, ...data]);
      setHasMore(data.length === PAGE_SIZE);
      setOffset((prev) => prev + data.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load more records");
    } finally {
      setLoading(false);
    }
  }, [accountId, countryCode, recordType, reviewStatus, offset, loading]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!accountId) { setRecords([]); setLoading(false); return; }
      try {
        setLoading(true);
        setError("");
        const data = await listTaxRecords(accountId, {
          countryCode, recordType, reviewStatus,
          limit: PAGE_SIZE, offset: 0,
        });
        if (!cancelled) {
          setRecords(data);
          setHasMore(data.length === PAGE_SIZE);
          setOffset(data.length);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load tax records");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [accountId, countryCode, recordType, reviewStatus]);

  return { records, loading, error, hasMore, refetch: load, loadMore };
}
