import { useCallback, useEffect, useMemo, useState } from "react";
import { Calculator, ChevronRight, FilePlus, Plus, RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useAccount } from "../context/AccountContext";
import { useI18n } from "../context/I18nContext";
import { usePageTitle } from "../layout/PageTitleContext";
import { listRentPlans, listRentPlanProperties, activateRentPlan, endRentPlan } from "../services/rentPlanService";
import { listAccountTenants } from "../services/tenantService";
import { listExpectedCharges, postExpectedCharge, cancelExpectedCharge } from "../services/expectedChargeService";
import RentPlanForm from "../components/rent/RentPlanForm";
import RentCalculationPreview from "../components/rent/RentCalculationPreview";
import ExpectedChargesList from "../components/rent/ExpectedChargesList";
import AdvancedModelSelector from "../components/rent/AdvancedModelSelector";

const STATUS_COLORS = {
  draft:          "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400",
  proposed:       "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  notice_pending: "bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-400",
  approved:       "bg-teal-100 text-teal-700 dark:bg-teal-950/40 dark:text-teal-400",
  active:         "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  superseded:     "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  ended:          "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
  cancelled:      "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-500",
};

function PlanCard({ plan, onActivate, onEnd, onPreview, onViewCharges, t, planMap, propertyById, tenantById }) {
  const [busy, setBusy]           = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const property = plan.property || propertyById.get(plan.property_id) || null;
  const tenant = plan.tenant || tenantById.get(plan.tenant_id) || null;
  const propertyLabel = property ? `${property.address}${property.city ? `, ${property.city}` : ""}` : t("rentPlans.unassignedProperty");
  const tenantLabel = tenant?.name || t("rentPlans.unassignedTenant");

  // Build the superseded chain for this plan (follow supersedes_id links backward)
  function buildHistory(currentPlan) {
    const chain = [];
    let cursor = currentPlan;
    while (cursor?.supersedes_id && planMap?.has(cursor.supersedes_id)) {
      cursor = planMap.get(cursor.supersedes_id);
      chain.push(cursor);
    }
    return chain;
  }
  const history = buildHistory(plan);

  async function handleActivate() {
    if (!window.confirm(t("rentPlans.confirmActivate"))) return;
    setBusy(true);
    try { await onActivate(plan.id); } finally { setBusy(false); }
  }

  async function handleEnd() {
    if (!window.confirm(t("rentPlans.confirmEnd"))) return;
    setBusy(true);
    try { await onEnd(plan.id); } finally { setBusy(false); }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${STATUS_COLORS[plan.status] ?? STATUS_COLORS.draft}`}>
              {plan.status}
            </span>
            <span className="text-xs text-slate-500 dark:text-slate-400">v{plan.version_number}</span>
            <span className="text-xs text-slate-500 dark:text-slate-400">{plan.market.toUpperCase()} · {plan.currency}</span>
          </div>
          <p className="mt-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
            {plan.currency} {Number(plan.base_rent_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })} / {plan.billing_frequency}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("rentPlans.startDate")}: {plan.start_date}
            {plan.end_date ? ` → ${plan.end_date}` : ""}
          </p>
          {plan.notes && (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 italic">{plan.notes}</p>
          )}
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {propertyLabel} · {tenantLabel}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-500 dark:text-slate-400">
        <div><span className="font-medium text-slate-700 dark:text-slate-300">{t("rentPlans.dueDay")}</span><br />{plan.due_day}</div>
        <div><span className="font-medium text-slate-700 dark:text-slate-300">{t("rentPlans.proration")}</span><br />{plan.proration_policy}</div>
        <div><span className="font-medium text-slate-700 dark:text-slate-300">{t("rentPlans.utilities")}</span><br />{plan.utilities_policy}</div>
        <div><span className="font-medium text-slate-700 dark:text-slate-300">{t("rentPlans.deposit")}</span><br />
          {plan.deposit_amount ? `${plan.currency} ${Number(plan.deposit_amount).toLocaleString()}` : "—"}
        </div>
      </div>

      {plan.rent_charge_rules?.length > 0 && (
        <div className="text-xs text-slate-500 dark:text-slate-400">
          +{plan.rent_charge_rules.length} {t("rentPlans.chargeRules")}
        </div>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        <button
          type="button"
          onClick={() => onPreview(plan)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
        >
          <Calculator size={12} />
          {t("rentPlans.preview")}
        </button>
        <button
          type="button"
          onClick={() => onViewCharges(plan)}
          className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1"
        >
          <ChevronRight size={12} />
          {t("rentPlans.expectedCharges")}
        </button>
        {plan.status === "draft" && (
          <button
            type="button"
            disabled={busy}
            onClick={handleActivate}
            className="text-xs px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white hover:bg-emerald-800 disabled:opacity-50"
          >
            {busy ? t("common.saving") : t("rentPlans.activate")}
          </button>
        )}
        {plan.status === "active" && (
          <button
            type="button"
            disabled={busy}
            onClick={handleEnd}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 disabled:opacity-50"
          >
            {t("rentPlans.endPlan")}
          </button>
        )}
        {history.length > 0 && (
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {showHistory ? t("rentPlans.hideHistory") : t("rentPlans.viewHistory")} ({history.length})
          </button>
        )}
      </div>

      {showHistory && history.length > 0 && (
        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
          <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{t("rentPlans.previousVersions")}</p>
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
              <span>
                v{h.version_number} · {h.currency} {Number(h.base_rent_amount).toLocaleString(undefined, { minimumFractionDigits: 2 })}/{h.billing_frequency}
              </span>
              <span className="text-[10px] text-slate-400">{h.start_date}{h.end_date ? ` → ${h.end_date}` : ""}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function RentPlansPage() {
  const { t } = useI18n();
  const { activeAccountId } = useAccount();
  const { setTitle } = usePageTitle();
  const [searchParams] = useSearchParams();
  const propertyParam = searchParams.get("property") || "";
  const tenantParam = searchParams.get("tenant") || "";
  const chargesParam = searchParams.get("charges") || searchParams.get("panel") || "";

  const [plans, setPlans]           = useState([]);
  const [properties, setProperties] = useState([]);
  const [tenants, setTenants]       = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [previewPlan, setPreviewPlan] = useState(null);
  const [chargesPlan, setChargesPlan] = useState(null);
  const [charges, setCharges]       = useState([]);
  const [chargesLoading, setChargesLoading] = useState(false);
  const [openedChargesFromUrl, setOpenedChargesFromUrl] = useState(false);

  useEffect(() => { setTitle(t("rentPlans.pageTitle")); }, [setTitle, t]);

  const propertyById = useMemo(() => new Map(properties.map((property) => [property.id, property])), [properties]);
  const tenantById = useMemo(() => new Map(tenants.map((tenant) => [tenant.id, tenant])), [tenants]);

  const contextLabel = useMemo(() => {
    const property = propertyById.get(propertyParam);
    const tenant = tenantById.get(tenantParam);
    if (property && tenant) return `${property.address}${property.city ? `, ${property.city}` : ""} · ${tenant.name}`;
    if (tenant) return tenant.name;
    if (property) return `${property.address}${property.city ? `, ${property.city}` : ""}`;
    return "";
  }, [propertyById, propertyParam, tenantById, tenantParam]);

  const loadPlans = useCallback(async () => {
    if (!activeAccountId) return;
    setLoading(true);
    setError(null);
    try {
      const planRows = await listRentPlans({ accountId: activeAccountId, propertyId: propertyParam, tenantId: tenantParam });
      setPlans(planRows);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [activeAccountId, propertyParam, tenantParam]);

  const loadReferenceData = useCallback(async () => {
    if (!activeAccountId) {
      setProperties([]);
      setTenants([]);
      return;
    }

    try {
      const [propertyRows, tenantRows] = await Promise.all([
        listRentPlanProperties({ accountId: activeAccountId }),
        listAccountTenants(activeAccountId),
      ]);
      setProperties(propertyRows);
      setTenants(tenantRows);
    } catch (e) {
      setError(e.message);
    }
  }, [activeAccountId]);

  useEffect(() => { loadReferenceData(); }, [loadReferenceData]);
  useEffect(() => { loadPlans(); }, [loadPlans]);

  useEffect(() => {
    if (!activeAccountId || !chargesParam || chargesPlan || openedChargesFromUrl) return;
    let dead = false;
    async function loadChargesPanel() {
      setOpenedChargesFromUrl(true);
      setChargesPlan({ all: true });
      setChargesLoading(true);
      try {
        const rows = await listExpectedCharges({ accountId: activeAccountId, status: "scheduled" });
        if (!dead) setCharges(rows);
      } finally {
        if (!dead) setChargesLoading(false);
      }
    }
    loadChargesPanel();
    return () => { dead = true; };
  }, [activeAccountId, chargesParam, chargesPlan, openedChargesFromUrl]);

  async function handleActivate(planId) {
    await activateRentPlan({ accountId: activeAccountId, rentPlanId: planId });
    await loadPlans();
  }

  async function handleEnd(planId) {
    await endRentPlan({ accountId: activeAccountId, rentPlanId: planId });
    await loadPlans();
  }

  async function handleViewCharges(plan) {
    setChargesPlan(plan);
    setChargesLoading(true);
    try {
      setCharges(await listExpectedCharges({ accountId: activeAccountId, rentPlanId: plan.id }));
    } finally {
      setChargesLoading(false);
    }
  }

  async function handlePostCharge(chargeId) {
    await postExpectedCharge({ accountId: activeAccountId, expectedChargeId: chargeId });
    await handleViewCharges(chargesPlan);
  }

  async function handleCancelCharge(chargeId) {
    await cancelExpectedCharge({ accountId: activeAccountId, expectedChargeId: chargeId });
    await handleViewCharges(chargesPlan);
  }

  // ── Sub-panel: expected charges ───────────────────────────────────────────
  if (chargesPlan) {
    const title = chargesPlan.all
      ? t("rentPlans.expectedCharges")
      : `${t("rentPlans.expectedChargesFor")} — ${Number(chargesPlan.base_rent_amount).toLocaleString()} ${chargesPlan.currency}/${chargesPlan.billing_frequency}`;
    return (
      <div className="space-y-4 max-w-3xl mx-auto px-4 py-6">
        <button
          type="button"
          onClick={() => setChargesPlan(null)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          ← {t("rentPlans.backToPlans")}
        </button>
        <h2 className="text-base font-semibold text-slate-800 dark:text-slate-200">
          {title}
        </h2>
        {chargesLoading
          ? <p className="text-sm text-slate-400">{t("common.loading")}</p>
          : <ExpectedChargesList
              charges={charges}
              propertyById={propertyById}
              tenantById={tenantById}
              onPost={handlePostCharge}
              onCancel={handleCancelCharge}
              t={t}
            />
        }
      </div>
    );
  }

  // ── Sub-panel: calculation preview ────────────────────────────────────────
  if (previewPlan) {
    return (
      <div className="space-y-4 max-w-3xl mx-auto px-4 py-6">
        <button
          type="button"
          onClick={() => setPreviewPlan(null)}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          ← {t("rentPlans.backToPlans")}
        </button>
        <RentCalculationPreview
          plan={previewPlan}
          accountId={activeAccountId}
          onClose={() => setPreviewPlan(null)}
          t={t}
        />
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">Advanced rent models</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">Select a model below to preview split rent, room rent, utilities, rent increases, discounts, or STR nightly charges.</p>
          <AdvancedModelSelector plan={previewPlan} t={t} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
            {t("rentPlans.pageTitle")}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {t("rentPlans.pageSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadPlans}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
            aria-label={t("common.refresh")}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          {!showForm && (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
            >
              <Plus size={12} />
              {t("rentPlans.addPlan")}
            </button>
          )}
        </div>
      </div>

      {/* Create form */}
      {showForm && (
        <RentPlanForm
          accountId={activeAccountId}
          initialPropertyId={propertyParam}
          initialTenantId={tenantParam}
          propertyOptions={properties}
          tenantOptions={tenants}
          onSaved={() => { setShowForm(false); loadPlans(); }}
          onCancel={() => setShowForm(false)}
          t={t}
        />
      )}

      {contextLabel && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">
          {t("rentPlans.contextBanner", { label: contextLabel })}
        </div>
      )}

      {/* Error */}
      {error && <p className="text-sm text-rose-600 dark:text-rose-400">{error}</p>}

      {/* Loading */}
      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {/* Empty state */}
      {!loading && !error && plans.length === 0 && !showForm && (
        <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-8 text-center space-y-3">
          <FilePlus size={28} className="text-slate-300 mx-auto" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
            {t("rentPlans.emptyTitle")}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
            {t("rentPlans.emptyBody")}
          </p>
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
          >
            <Plus size={12} />
            {t("rentPlans.addPlan")}
          </button>
        </div>
      )}

      {/* Plan cards */}
      {!loading && (() => {
        const planMap = new Map(plans.map((p) => [p.id, p]));
        return plans.map((plan) => (
          <PlanCard
            key={plan.id}
            plan={plan}
            onActivate={handleActivate}
            onEnd={handleEnd}
            onPreview={setPreviewPlan}
            onViewCharges={handleViewCharges}
            t={t}
            planMap={planMap}
            propertyById={propertyById}
            tenantById={tenantById}
          />
        ));
      })()}
    </div>
  );
}
