import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import {
  getPrimaryLease,
  upsertLease,
} from "../services/leaseService";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString();
}

function statusTone(status) {
  if (status === "ended") return "bg-rose-100 text-rose-700 border-rose-200";
  if (status === "expiring_soon") return "bg-amber-100 text-amber-800 border-amber-200";
  if (status === "renewal_in_progress") return "bg-blue-100 text-blue-700 border-blue-200";
  if (status === "renewed") return "bg-emerald-100 text-emerald-700 border-emerald-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

function buildFormState(lease, propertyId, tenantId) {
  return {
    leaseStartDate: lease?.lease_start_date || "",
    leaseEndDate: lease?.lease_end_date || "",
    renewalStatus: lease?.renewal_status || "active",
    noticePeriodDays: String(lease?.notice_period_days ?? 30),
    autoRenew: Boolean(lease?.auto_renew),
    notes: lease?.notes || "",
    propertyId: lease?.property_id || propertyId || "",
    tenantId: lease?.tenant_id || tenantId || "",
  };
}

export default function LeaseSummaryCard({
  accountId,
  propertyId = null,
  tenantId = null,
  canManage = false,
}) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [lease, setLease] = useState(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(buildFormState(null, propertyId, tenantId));

  async function load() {
    if (!accountId || (!propertyId && !tenantId)) {
      setLease(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const row = await getPrimaryLease({ accountId, propertyId, tenantId });
      setLease(row);
      setForm(buildFormState(row, propertyId, tenantId));
    } catch (e) {
      setLease(null);
      setError(e?.message || t("leases.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, propertyId, tenantId]);

  useRealtimeTables({
    enabled: !!accountId,
    subscriptions: [
      { channel: `leases:${accountId}`, table: "leases", filter: `account_id=eq.${accountId}` },
    ],
    onChange: load,
  });

  const derivedStatus = String(lease?.derivedStatus || "active");

  const statusText = useMemo(() => {
    return t(`leases.status.${derivedStatus}`);
  }, [derivedStatus, t]);

  const expiryText = useMemo(() => {
    if (!lease || !Number.isFinite(lease.daysUntilEnd)) return t("leases.status.noLease");
    if (lease.daysUntilEnd < 0) {
      return t("leases.expiredAgo", { count: Math.abs(lease.daysUntilEnd) });
    }
    if (lease.daysUntilEnd === 0) return t("leases.expiresToday");
    return t("leases.expiresIn", { count: lease.daysUntilEnd });
  }, [lease, t]);

  async function handleSave(e) {
    e.preventDefault();
    if (!accountId) return;

    setSaving(true);
    setError("");
    try {
      const saved = await upsertLease({
        id: lease?.id || null,
        accountId,
        propertyId: form.propertyId,
        tenantId: form.tenantId,
        leaseStartDate: form.leaseStartDate,
        leaseEndDate: form.leaseEndDate,
        renewalStatus: form.renewalStatus,
        noticePeriodDays: form.noticePeriodDays,
        autoRenew: form.autoRenew,
        notes: form.notes,
      });
      setLease(saved);
      setForm(buildFormState(saved, propertyId, tenantId));
      setEditing(false);
    } catch (err) {
      setError(err?.message || t("leases.saveError"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Card className="p-4 bg-slate-50">
        <Skeleton className="h-5 w-40" />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-4 gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      </Card>
    );
  }

  const missingTenantOrProperty = !form.propertyId || !form.tenantId;

  return (
    <Card className="p-4 bg-slate-50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold text-slate-900">
            {t("leases.title")}
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            {lease ? t("leases.subtitle") : t("leases.empty")}
          </p>
        </div>
        {lease ? (
          <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${statusTone(derivedStatus)}`}>
            {statusText}
          </span>
        ) : null}
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      {!lease && !editing ? (
        <div className="mt-3 rounded-lg border border-dashed border-slate-300 bg-white p-4">
          <p className="text-sm text-slate-600">
            {missingTenantOrProperty ? t("leases.assignTenantFirst") : t("leases.empty")}
          </p>
          {canManage && !missingTenantOrProperty ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-3 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-800"
            >
              {t("leases.add")}
            </button>
          ) : null}
        </div>
      ) : null}

      {lease && !editing ? (
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("leases.startDate")}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{formatDate(lease.lease_start_date)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("leases.endDate")}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{formatDate(lease.lease_end_date)}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("leases.noticePeriod")}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">
                {t("leases.noticePeriodValue", { count: Number(lease.notice_period_days || 0) })}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <p className="text-xs text-slate-500">{t("leases.renewalWatch")}</p>
              <p className="text-sm font-semibold text-slate-900 mt-1">{expiryText}</p>
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-slate-500">{t("leases.autoRenew")}</p>
                <p className="text-sm font-semibold text-slate-900 mt-1">
                  {lease.auto_renew ? t("common.yes") : t("common.no")}
                </p>
              </div>
              {canManage ? (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  {t("leases.manage")}
                </button>
              ) : null}
            </div>
            {lease.notes ? (
              <p className="mt-3 text-sm text-slate-600 whitespace-pre-wrap">{lease.notes}</p>
            ) : (
              <p className="mt-3 text-sm text-slate-500">{t("leases.noNotes")}</p>
            )}
          </div>
        </div>
      ) : null}

      {editing ? (
        <form onSubmit={handleSave} className="mt-3 rounded-lg border border-slate-200 bg-white p-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-xs text-slate-500">{t("leases.startDate")}</span>
              <input
                type="date"
                value={form.leaseStartDate}
                onChange={(e) => setForm((prev) => ({ ...prev, leaseStartDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-500">{t("leases.endDate")}</span>
              <input
                type="date"
                value={form.leaseEndDate}
                onChange={(e) => setForm((prev) => ({ ...prev, leaseEndDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
                required
              />
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-500">{t("leases.renewalStatus")}</span>
              <select
                value={form.renewalStatus}
                onChange={(e) => setForm((prev) => ({ ...prev, renewalStatus: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              >
                <option value="active">{t("leases.status.active")}</option>
                <option value="expiring_soon">{t("leases.status.expiring_soon")}</option>
                <option value="renewal_in_progress">{t("leases.status.renewal_in_progress")}</option>
                <option value="renewed">{t("leases.status.renewed")}</option>
                <option value="ended">{t("leases.status.ended")}</option>
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-500">{t("leases.noticePeriod")}</span>
              <input
                type="number"
                min="0"
                value={form.noticePeriodDays}
                onChange={(e) => setForm((prev) => ({ ...prev, noticePeriodDays: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.autoRenew}
              onChange={(e) => setForm((prev) => ({ ...prev, autoRenew: e.target.checked }))}
            />
            <span>{t("leases.autoRenew")}</span>
          </label>

          <label className="text-sm block">
            <span className="text-xs text-slate-500">{t("leases.notes")}</span>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
              placeholder={t("leases.notesPlaceholder")}
            />
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setForm(buildFormState(lease, propertyId, tenantId));
              }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || missingTenantOrProperty}
              className={`rounded-lg px-3 py-2 text-sm text-white ${
                saving || missingTenantOrProperty ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"
              }`}
            >
              {saving ? t("common.saving") : t("common.save")}
            </button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
