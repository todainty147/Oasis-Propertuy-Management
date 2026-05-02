import { useState, useEffect, useMemo } from "react";
import { useAccount } from "../context/AccountContext";
import { useProperties } from "./useProperties";
import { usePayments } from "./usePayments";
import { useTenants } from "./useTenants";
import { listLeases } from "../services/leaseService";
import { getAccountOwnerContact } from "../services/accountOwnerService";
import { OCCUPANCY_STATUS } from "../utils/statuses";

/**
 * Encapsulates all manager-level portfolio data: properties, payments, tenants,
 * leases, owner contact, and derived occupancy/vacancy metrics.
 *
 * Only mount this hook for manager sessions (owner / admin / staff).
 * Tenant and contractor sessions use their own scoped hooks.
 *
 * @param {{ enabled: boolean }} options
 */
export function usePortfolioShellData({ enabled }) {
  const { activeAccountId } = useAccount();

  const {
    properties,
    loading: propertiesLoading,
    error: propertiesError,
    refetch: refetchProperties,
  } = useProperties({ enabled });

  const {
    payments,
    loading: paymentsLoading,
    error: paymentsError,
  } = usePayments({ enabled });

  const {
    tenants,
    loading: tenantsLoading,
    error: tenantsError,
  } = useTenants({ enabled });

  const [accountOwnerEmail, setAccountOwnerEmail] = useState("");
  const [leases, setLeases] = useState([]);
  const [leasesError, setLeasesError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function loadOwnerContact() {
      if (!enabled || !activeAccountId) return;
      try {
        const owner = await getAccountOwnerContact(activeAccountId);
        if (!cancelled) setAccountOwnerEmail(owner?.ownerEmail || "");
      } catch {
        if (!cancelled) setAccountOwnerEmail("");
      }
    }
    loadOwnerContact();
    return () => { cancelled = true; };
  }, [activeAccountId, enabled]);

  useEffect(() => {
    let cancelled = false;
    async function loadLeases() {
      if (!enabled || !activeAccountId) {
        setLeases([]);
        setLeasesError(null);
        return;
      }
      try {
        const rows = await listLeases({ accountId: activeAccountId, limit: 500 });
        if (!cancelled) { setLeases(rows); setLeasesError(null); }
      } catch (error) {
        if (!cancelled) { setLeases([]); setLeasesError(error); }
      }
    }
    loadLeases();
    return () => { cancelled = true; };
  }, [activeAccountId, enabled]);

  // ── Derived data ────────────────────────────────────────────────────────────

  const ownerTenants = tenants;

  const ownerProperties = useMemo(
    () =>
      properties.map((p) => {
        const isOccupied = tenants.some(
          (t) => String(t.propertyId) === String(p.id),
        );
        return { ...p, status: isOccupied ? OCCUPANCY_STATUS.OCCUPIED : OCCUPANCY_STATUS.VACANT };
      }),
    [properties, tenants],
  );

  const ownerPropertyIds = useMemo(
    () => new Set(ownerProperties.map((p) => String(p.id))),
    [ownerProperties],
  );

  const ownerPayments = useMemo(
    () => payments.filter((p) => ownerPropertyIds.has(String(p.propertyId))),
    [payments, ownerPropertyIds],
  );

  const { occupiedCount, vacantCount, occupancyRate } = useMemo(() => {
    const occupied = ownerProperties.filter(
      (p) => p.status === OCCUPANCY_STATUS.OCCUPIED,
    ).length;
    const vacant = ownerProperties.length - occupied;
    const rate = ownerProperties.length > 0
      ? Math.round((occupied / ownerProperties.length) * 100)
      : 0;
    return { occupiedCount: occupied, vacantCount: vacant, occupancyRate: rate };
  }, [ownerProperties]);

  const longVacantProperties = useMemo(() => {
    const now = new Date();
    return ownerProperties
      .filter((p) => p.status === OCCUPANCY_STATUS.VACANT)
      .map((property) => {
        const latestEndedLease = leases
          .filter((lease) => String(lease.property_id) === String(property.id))
          .filter((lease) => {
            if (!lease.lease_end_date) return false;
            const leaseEnd = new Date(`${lease.lease_end_date}T00:00:00`);
            return !Number.isNaN(leaseEnd.getTime()) && leaseEnd <= now;
          })
          .sort((a, b) =>
            String(b.lease_end_date).localeCompare(String(a.lease_end_date)),
          )[0];
        const vacancyStart = latestEndedLease?.lease_end_date || property.createdAt || property.created_at;
        const vacancyStartDate = vacancyStart ? new Date(vacancyStart) : null;
        const daysVacant = vacancyStartDate && !Number.isNaN(vacancyStartDate.getTime())
          ? Math.floor((now - vacancyStartDate) / (1000 * 60 * 60 * 24))
          : 0;
        return { ...property, daysVacant };
      })
      .filter((p) => p.daysVacant > 30);
  }, [leases, ownerProperties]);

  return {
    // Raw hook data
    properties,
    payments,
    tenants,
    leases,
    accountOwnerEmail,
    // Loading / error states
    propertiesLoading,
    paymentsLoading,
    tenantsLoading,
    leasesError,
    propertiesError,
    paymentsError,
    tenantsError,
    refetchProperties,
    // Derived manager data
    ownerTenants,
    ownerProperties,
    ownerPropertyIds,
    ownerPayments,
    occupiedCount,
    vacantCount,
    occupancyRate,
    longVacantProperties,
  };
}
