import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Clock,
  MinusCircle,
  RotateCcw,
  Settings2,
} from "lucide-react";

import { useAccount }  from "../../context/AccountContext";
import { useI18n }     from "../../context/I18nContext";
import {
  calcTaxOfficeDueDate,
  NAJEM_OKAZJONALNY_ITEM_KEYS,
  summariseChecklist,
} from "../../utils/complianceMarket";
import {
  listChecklistItems,
  setupNajemOkazjonalnyChecklist,
  updateChecklistItemStatus,
} from "../../services/complianceChecklistService";
import {
  getEvidencePack,
  linkDocumentToChecklistItem,
  listHandoverProtocols,
  listMeterReadings,
  removeDocumentFromChecklistItem,
} from "../../services/evidencePackService";
import {
  getActiveLease,
  listTenantsForProperty,
  listPropertiesForAccount,
} from "../../services/complianceChecklistService";
import EvidencePack           from "../../components/compliance/EvidencePack";
import DocumentLinkPicker     from "../../components/compliance/DocumentLinkPicker";
import HandoverProtocolPanel  from "../../components/compliance/HandoverProtocolPanel";
import MeterReadingEntry      from "../../components/compliance/MeterReadingEntry";

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(value) {
  if (!value) return null;
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString();
}

function isDueSoon(dueDateString) {
  if (!dueDateString) return false;
  const today = new Date(new Date().toDateString());
  const due   = new Date(`${String(dueDateString).slice(0, 10)}T00:00:00`);
  const diff  = Math.round((due - today) / 86_400_000);
  return diff >= 0 && diff <= 7;
}

function isOverdue(dueDateString) {
  if (!dueDateString) return false;
  const today = new Date(new Date().toDateString());
  const due   = new Date(`${String(dueDateString).slice(0, 10)}T00:00:00`);
  return due < today;
}

function sortItems(items) {
  return [...items].sort((a, b) => {
    const ai = NAJEM_OKAZJONALNY_ITEM_KEYS.indexOf(a.item_key);
    const bi = NAJEM_OKAZJONALNY_ITEM_KEYS.indexOf(b.item_key);
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
  });
}

// ── Status badge ────────────────────────────────────────────────────────────

function StatusBadge({ status, dueDateString, t }) {
  if (status === "complete") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700 border border-green-200 dark:bg-green-950/40 dark:text-green-300 dark:border-green-900">
        <CheckCircle2 size={11} />
        {t("polandCompliance.statusComplete")}
      </span>
    );
  }
  if (status === "not_applicable") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-500 border border-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700">
        <MinusCircle size={11} />
        {t("polandCompliance.statusNotApplicable")}
      </span>
    );
  }
  if (status === "pending" && isOverdue(dueDateString)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900">
        <AlertTriangle size={11} />
        {t("polandCompliance.statusOverdue")}
      </span>
    );
  }
  if (status === "pending" && isDueSoon(dueDateString)) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
        <Clock size={11} />
        {t("polandCompliance.statusDueSoon")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900">
      <Circle size={11} />
      {t("polandCompliance.statusPending")}
    </span>
  );
}

// ── Summary bar ─────────────────────────────────────────────────────────────

function SummaryBar({ summary, t }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {[
        { label: t("polandCompliance.summaryTotal"),   value: summary.total,    accent: "border-slate-200" },
        { label: t("polandCompliance.summaryComplete"), value: summary.complete, accent: "border-green-200 bg-green-50 dark:bg-green-950/20" },
        { label: t("polandCompliance.summaryPending"),  value: summary.pending,  accent: "border-blue-200 bg-blue-50 dark:bg-blue-950/20" },
        { label: t("polandCompliance.summaryOverdue"),  value: summary.overdue,  accent: "border-red-200 bg-red-50 dark:bg-red-950/20" },
      ].map(({ label, value, accent }) => (
        <div key={label} className={`rounded-xl border p-3 ${accent}`}>
          <p className="text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</p>
          <p className="mt-0.5 text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
        </div>
      ))}
    </div>
  );
}

// ── Checklist item row ──────────────────────────────────────────────────────

function ChecklistItemRow({ item, onStatusChange, onLinkDocument, updating, t }) {
  const isPending    = item.status === "pending";
  const isComplete   = item.status === "complete";
  const isNA         = item.status === "not_applicable";
  const overdueFlag  = isPending && isOverdue(item.due_date);
  const dueSoonFlag  = isPending && isDueSoon(item.due_date);
  const hasDoc       = Boolean(item.evidence_document_id);

  return (
    <div className={`p-4 border rounded-xl transition-colors ${
      overdueFlag  ? "border-red-200 bg-red-50/30 dark:border-red-900/40 dark:bg-red-950/10"
      : dueSoonFlag ? "border-amber-200 bg-amber-50/30 dark:border-amber-900/40 dark:bg-amber-950/10"
      : isComplete  ? "border-green-200 bg-green-50/20 dark:border-green-900/30 dark:bg-green-950/10"
      : "border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900"
    }`}>
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.title}</p>
            <StatusBadge status={item.status} dueDateString={item.due_date} t={t} />
          </div>
          {item.due_date && (
            <p className={`mt-1 text-xs ${overdueFlag ? "text-red-600 dark:text-red-400 font-medium" : "text-slate-500 dark:text-slate-400"}`}>
              {t("polandCompliance.dueDateLabel", { date: formatDate(item.due_date) })}
            </p>
          )}
          {hasDoc && (
            <p className="mt-1 text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1">
              {t("evidencePack.docLinked")}
              {item.doc_name && ` · ${item.doc_name}`}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {isPending && (
            <>
              <button
                type="button"
                disabled={updating}
                onClick={() => onStatusChange(item.id, "complete")}
                className="text-xs px-2 py-1 rounded-lg border border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300 dark:hover:bg-green-950/30 disabled:opacity-50"
              >
                {t("polandCompliance.markComplete")}
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => onStatusChange(item.id, "not_applicable")}
                className="text-xs px-2 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {t("polandCompliance.markNotApplicable")}
              </button>
              <button
                type="button"
                disabled={updating}
                onClick={() => onLinkDocument(item)}
                className="text-xs px-2 py-1 rounded-lg border border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-300 dark:hover:bg-blue-950/30 disabled:opacity-50"
              >
                {hasDoc ? t("evidencePack.replace") : t("evidencePack.linkDocument")}
              </button>
            </>
          )}
          {(isComplete || isNA) && (
            <button
              type="button"
              disabled={updating}
              onClick={() => onStatusChange(item.id, "pending")}
              className="text-xs px-2 py-1 rounded-lg border border-slate-300 text-slate-500 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-50 flex items-center gap-1"
            >
              <RotateCcw size={11} />
              {t("polandCompliance.markPending")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function PolandCompliancePage() {
  const { t } = useI18n();
  const { activeAccountId } = useAccount();

  // Filter state
  const [properties,  setProperties]  = useState([]);
  const [tenants,     setTenants]     = useState([]);
  const [activeLease, setActiveLease] = useState(null);
  const [propertyId,  setPropertyId]  = useState("");
  const [tenantId,    setTenantId]    = useState("");
  const [leaseType,   setLeaseType]   = useState("najem_okazjonalny");

  // Checklist state
  const [items,        setItems]        = useState([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [setupLoading, setSetupLoading] = useState(false);
  const [updating,     setUpdating]     = useState(false);
  const [error,        setError]        = useState(null);
  const [setupMsg,     setSetupMsg]     = useState(null);

  // Evidence pack state
  const [evidencePack, setEvidencePack] = useState(null);
  const [epLoading,    setEpLoading]    = useState(false);

  // Handover + meters state
  const [protocols, setProtocols] = useState([]);
  const [readings,  setReadings]  = useState([]);

  // Document picker state
  const [pickerItem, setPickerItem] = useState(null); // checklist item being linked

  // Load properties
  useEffect(() => {
    if (!activeAccountId) return;
    listPropertiesForAccount(activeAccountId).then(setProperties).catch(() => {});
  }, [activeAccountId]);

  // Load tenants when property changes
  useEffect(() => {
    setTenantId(""); setActiveLease(null); setItems([]);
    setEvidencePack(null); setProtocols([]); setReadings([]); setSetupMsg(null);
    if (!activeAccountId || !propertyId) { setTenants([]); return; }
    listTenantsForProperty(activeAccountId, propertyId).then(setTenants).catch(() => {});
  }, [activeAccountId, propertyId]);

  // Load all tenant-scoped data when tenant changes
  useEffect(() => {
    setActiveLease(null); setItems([]);
    setEvidencePack(null); setProtocols([]); setReadings([]); setSetupMsg(null);
    if (!activeAccountId || !propertyId || !tenantId) return;

    let cancelled = false;

    getActiveLease(activeAccountId, propertyId, tenantId)
      .then((lease) => { if (!cancelled) setActiveLease(lease); })
      .catch(() => {});

    setLoadingItems(true);
    listChecklistItems({ accountId: activeAccountId, propertyId, tenantId, checklistType: "najem_okazjonalny" })
      .then((rows) => { if (!cancelled) setItems(rows); })
      .catch(() => { if (!cancelled) setError(t("polandCompliance.loadError")); })
      .finally(() => { if (!cancelled) setLoadingItems(false); });

    listHandoverProtocols({ accountId: activeAccountId, propertyId, tenantId })
      .then((rows) => { if (!cancelled) setProtocols(rows); })
      .catch(() => {});

    listMeterReadings({ accountId: activeAccountId, propertyId, tenantId })
      .then((rows) => { if (!cancelled) setReadings(rows); })
      .catch(() => {});

    return () => { cancelled = true; };
  }, [activeAccountId, propertyId, tenantId]);

  // Reload evidence pack whenever items change
  useEffect(() => {
    if (!activeAccountId || !propertyId || !tenantId || items.length === 0) {
      setEvidencePack(null); return;
    }
    let cancelled = false;
    setEpLoading(true);
    getEvidencePack({ accountId: activeAccountId, propertyId, tenantId })
      .then((data) => { if (!cancelled) setEvidencePack(data); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setEpLoading(false); });
    return () => { cancelled = true; };
  }, [activeAccountId, propertyId, tenantId, items]);

  const reloadAll = useCallback(async () => {
    if (!activeAccountId || !propertyId || !tenantId) return;
    const [rows, protos, meters] = await Promise.all([
      listChecklistItems({ accountId: activeAccountId, propertyId, tenantId, checklistType: "najem_okazjonalny" }),
      listHandoverProtocols({ accountId: activeAccountId, propertyId, tenantId }),
      listMeterReadings({ accountId: activeAccountId, propertyId, tenantId }),
    ]).catch(() => [items, protocols, readings]);
    setItems(rows);
    setProtocols(protos);
    setReadings(meters);
  }, [activeAccountId, propertyId, tenantId]);

  const handleSetup = useCallback(async () => {
    if (!propertyId || !tenantId) return;
    setSetupLoading(true); setError(null); setSetupMsg(null);
    try {
      const result = await setupNajemOkazjonalnyChecklist({
        accountId:  activeAccountId,
        propertyId,
        tenantId,
        leaseId:    activeLease?.id || null,
        leaseStart: activeLease?.lease_start_date || null,
      });
      await reloadAll();
      setSetupMsg(result?.created > 0
        ? t("polandCompliance.setupSuccess", { count: result.created })
        : t("polandCompliance.alreadySetup", { skipped: result?.skipped ?? 0 }));
    } catch {
      setError(t("polandCompliance.setupError"));
    } finally {
      setSetupLoading(false);
    }
  }, [activeAccountId, propertyId, tenantId, activeLease, t, reloadAll]);

  const handleStatusChange = useCallback(async (itemId, newStatus) => {
    setUpdating(true); setError(null);
    try {
      const updated = await updateChecklistItemStatus({ accountId: activeAccountId, itemId, status: newStatus });
      setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
    } catch {
      setError(t("polandCompliance.updateError"));
    } finally {
      setUpdating(false);
    }
  }, [activeAccountId, t]);

  const handleLinkDocument = useCallback((item) => {
    setPickerItem(item);
  }, []);

  const handlePickerSelect = useCallback(async (doc) => {
    if (!pickerItem || !doc) return;
    setPickerItem(null);
    setUpdating(true); setError(null);
    try {
      await linkDocumentToChecklistItem({
        accountId:  activeAccountId,
        itemId:     pickerItem.id,
        documentId: doc.id,
        markComplete: false,
      });
      await reloadAll();
    } catch {
      setError(t("polandCompliance.updateError"));
    } finally {
      setUpdating(false);
    }
  }, [activeAccountId, pickerItem, reloadAll, t]);

  const handleRemoveEvidence = useCallback(async (item) => {
    setUpdating(true); setError(null);
    try {
      await removeDocumentFromChecklistItem({ accountId: activeAccountId, itemId: item.item_id || item.id });
      await reloadAll();
    } catch {
      setError(t("polandCompliance.updateError"));
    } finally {
      setUpdating(false);
    }
  }, [activeAccountId, reloadAll, t]);

  const sorted  = sortItems(items);
  const summary = summariseChecklist(items);
  const hasSelection = Boolean(propertyId && tenantId);
  const taxDue  = calcTaxOfficeDueDate(activeLease?.lease_start_date);

  // Evidence pack items (from server-side summary, falls back to local items if not loaded)
  const epItems = evidencePack?.items ?? null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t("polandCompliance.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {t("polandCompliance.subtitle")}
        </p>
      </div>

      {/* Disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 flex gap-3 items-start">
        <AlertTriangle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800 dark:text-amber-300">{t("polandCompliance.disclaimer")}</p>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Settings2 size={16} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("polandCompliance.filterTitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("polandCompliance.selectProperty")}</label>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="">{t("polandCompliance.selectPropertyPlaceholder")}</option>
              {properties.map((p) => <option key={p.id} value={p.id}>{p.address}{p.city ? `, ${p.city}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("polandCompliance.selectTenant")}</label>
            <select value={tenantId} onChange={(e) => setTenantId(e.target.value)} disabled={!propertyId}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50">
              <option value="">{t("polandCompliance.selectTenantPlaceholder")}</option>
              {tenants.map((t_) => <option key={t_.id} value={t_.id}>{t_.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{t("polandCompliance.leaseType")}</label>
            <select value={leaseType} onChange={(e) => setLeaseType(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option value="najem_okazjonalny">{t("polandCompliance.leaseTypeOkazjonalny")}</option>
              <option value="standard">{t("polandCompliance.leaseTypeStandard")}</option>
            </select>
          </div>
        </div>
        {hasSelection && activeLease?.lease_start_date && leaseType === "najem_okazjonalny" && taxDue && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            {t("polandCompliance.taxOfficeDueHint", { date: formatDate(taxDue.toISOString()) })}
          </p>
        )}
      </div>

      {/* Alerts */}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30 px-4 py-3 text-sm text-red-700 dark:text-red-300">{error}</div>
      )}
      {setupMsg && (
        <div className="rounded-xl border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3 text-sm text-green-700 dark:text-green-300">{setupMsg}</div>
      )}

      {/* Content area */}
      {!hasSelection && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("polandCompliance.noSelection")}</p>
        </div>
      )}

      {hasSelection && leaseType !== "najem_okazjonalny" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("polandCompliance.nonOkazjonalnyNote")}</p>
        </div>
      )}

      {hasSelection && leaseType === "najem_okazjonalny" && (
        <div className="space-y-4">
          {loadingItems ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center space-y-3">
              <p className="text-sm text-slate-600 dark:text-slate-400">{t("polandCompliance.checklistEmpty")}</p>
              <button type="button" disabled={setupLoading} onClick={handleSetup}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                {setupLoading ? t("common.loading") : t("polandCompliance.setupChecklist")}
              </button>
            </div>
          ) : (
            <>
              {/* Evidence Pack — above checklist */}
              <EvidencePack
                items={epItems || sorted}
                loading={epLoading}
                onLinkDocument={(item) => handleLinkDocument({ ...item, id: item.item_id || item.id })}
                onRemoveDocument={handleRemoveEvidence}
              />

              {/* Summary */}
              <SummaryBar summary={summary} t={t} />

              {/* Checklist */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("polandCompliance.checklistTitle")}</p>
                  <button type="button" disabled={setupLoading} onClick={handleSetup}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800 disabled:opacity-50">
                    {t("polandCompliance.refreshChecklist")}
                  </button>
                </div>
                <div className="p-4 space-y-3">
                  {sorted.map((item) => (
                    <ChecklistItemRow
                      key={item.id}
                      item={item}
                      onStatusChange={handleStatusChange}
                      onLinkDocument={handleLinkDocument}
                      updating={updating}
                      t={t}
                    />
                  ))}
                </div>
              </div>

              {/* Handover Protocol */}
              <HandoverProtocolPanel
                accountId={activeAccountId}
                propertyId={propertyId}
                tenantId={tenantId}
                leaseId={activeLease?.id || null}
                protocols={protocols}
                onSaved={reloadAll}
              />

              {/* Meter Readings */}
              <MeterReadingEntry
                accountId={activeAccountId}
                propertyId={propertyId}
                tenantId={tenantId}
                readings={readings}
                onSaved={reloadAll}
              />
            </>
          )}
        </div>
      )}

      {/* Document picker modal */}
      {pickerItem && (
        <DocumentLinkPicker
          accountId={activeAccountId}
          propertyId={propertyId}
          tenantId={tenantId}
          checklistItem={pickerItem}
          onSelect={handlePickerSelect}
          onClose={() => setPickerItem(null)}
        />
      )}
    </div>
  );
}
