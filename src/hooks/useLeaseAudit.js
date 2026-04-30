import { useCallback, useEffect, useState } from "react";
import {
  listLeaseAudits,
  getLatestLeaseAudit,
  listLeaseAuditFindings,
} from "../services/leaseAuditService";

export function useLeaseAudits(accountId, { leaseId = null } = {}) {
  const [audits, setAudits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accountId) { setAudits([]); setLoading(false); return; }
    try {
      setLoading(true);
      setError("");
      const data = await listLeaseAudits(accountId, { leaseId });
      setAudits(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audits");
    } finally {
      setLoading(false);
    }
  }, [accountId, leaseId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!accountId) { setAudits([]); setLoading(false); return; }
      try {
        setLoading(true);
        setError("");
        const data = await listLeaseAudits(accountId, { leaseId });
        if (!cancelled) setAudits(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load audits");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [accountId, leaseId]);

  return { audits, loading, error, refetch: load };
}

export function useLatestLeaseAudit(accountId, leaseId) {
  const [audit, setAudit] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accountId || !leaseId) { setAudit(null); setLoading(false); return; }
    try {
      setLoading(true);
      setError("");
      const data = await getLatestLeaseAudit(accountId, leaseId);
      setAudit(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load audit");
    } finally {
      setLoading(false);
    }
  }, [accountId, leaseId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!accountId || !leaseId) { setAudit(null); setLoading(false); return; }
      try {
        setLoading(true);
        setError("");
        const data = await getLatestLeaseAudit(accountId, leaseId);
        if (!cancelled) setAudit(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load audit");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [accountId, leaseId]);

  return { audit, loading, error, refetch: load };
}

export function useLeaseAuditFindings(accountId, leaseAuditId) {
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!accountId || !leaseAuditId) { setFindings([]); return; }
    try {
      setLoading(true);
      setError("");
      const data = await listLeaseAuditFindings(accountId, leaseAuditId);
      setFindings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setLoading(false);
    }
  }, [accountId, leaseAuditId]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (!accountId || !leaseAuditId) { setFindings([]); setLoading(false); return; }
      try {
        setLoading(true);
        setError("");
        const data = await listLeaseAuditFindings(accountId, leaseAuditId);
        if (!cancelled) setFindings(data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load findings");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    run();
    return () => { cancelled = true; };
  }, [accountId, leaseAuditId]);

  return { findings, loading, error, refetch: load };
}
