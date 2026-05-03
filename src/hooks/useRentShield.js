import { useCallback, useEffect, useState } from "react";
import { listRentShieldAssessments, getLatestAssessmentByProperty } from "../services/rentShieldService";

export function useRentShield(accountId, { propertyId = null } = {}) {
  const [assessments, setAssessments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accountId) { setAssessments([]); setLoading(false); return; }
    try {
      setLoading(true);
      setError("");
      const data = await listRentShieldAssessments(accountId, { propertyId });
      setAssessments(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load assessments");
    } finally {
      setLoading(false);
    }
  }, [accountId, propertyId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!accountId) { setAssessments([]); setLoading(false); return; }
      try {
        setLoading(true);
        setError("");
        const data = await listRentShieldAssessments(accountId, { propertyId });
        if (!cancelled) setAssessments(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load assessments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [accountId, propertyId]);

  return { assessments, loading, error, refetch: load };
}

export function useRentShieldPortfolio(accountId) {
  const [latestByProperty, setLatestByProperty] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accountId) { setLatestByProperty([]); setLoading(false); return; }
    try {
      setLoading(true);
      setError("");
      const data = await getLatestAssessmentByProperty(accountId);
      setLatestByProperty(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load portfolio assessments");
    } finally {
      setLoading(false);
    }
  }, [accountId]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!accountId) { setLatestByProperty([]); setLoading(false); return; }
      try {
        setLoading(true);
        setError("");
        const data = await getLatestAssessmentByProperty(accountId);
        if (!cancelled) setLatestByProperty(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load portfolio assessments");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [accountId]);

  return { latestByProperty, loading, error, refetch: load };
}
