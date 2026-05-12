import { useCallback, useEffect, useState } from "react";
import { Building2, CheckCircle2, Circle, RefreshCw, Save, Search, Sparkles } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { getStrProperty, upsertStrProperty } from "../../services/plStrService";
import { listPropertiesForAccount } from "../../services/complianceChecklistService";
import { calcStrReadinessScore, getStrMissingItems, STR_SAFETY_KEYS, STR_PLATFORMS } from "../../utils/plAdvancedUtils";

const REGISTRATION_STATUSES = ["not_started", "pending", "registered", "expired"];
const REPORTING_STATUSES    = ["not_ready", "partial", "ready"];

// ── Readiness bar ─────────────────────────────────────────────────────────────

function ReadinessBar({ score }) {
  const color = score >= 80 ? "bg-green-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all duration-500`} style={{ width: `${score}%` }} />
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 text-right">{score}%</p>
    </div>
  );
}

// ── Safety check item ─────────────────────────────────────────────────────────

function SafetyCheckItem({ itemKey, status, onChange, t }) {
  const statuses = ["pending", "confirmed", "not_applicable"];
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
      <p className="text-sm text-slate-700 dark:text-slate-300">
        {status === "confirmed"
          ? <CheckCircle2 size={13} className="inline mr-1.5 text-green-500" />
          : <Circle size={13} className="inline mr-1.5 text-slate-300" />}
        {t(`plAdvanced.str.safetyItem.${itemKey}`)}
      </p>
      <div className="flex gap-1">
        {statuses.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onChange(itemKey, s)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
              status === s
                ? s === "confirmed"
                  ? "border-green-400 bg-green-50 text-green-700 dark:border-green-700 dark:bg-green-950/30 dark:text-green-300"
                  : s === "not_applicable"
                    ? "border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    : "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
                : "border-slate-200 text-slate-400 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {t(`plAdvanced.str.safetyStatus.${s}`)}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Property selector (when no propertyId prop given) ─────────────────────────

function PropertySelector({ accountId, onSelect, t }) {
  const [properties, setProperties] = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [query, setQuery]           = useState("");

  useEffect(() => {
    if (!accountId) return;
    setLoading(true);
    listPropertiesForAccount(accountId)
      .then((data) => setProperties(data || []))
      .catch(() => setError(t("plAdvanced.str.loadPropertiesError")))
      .finally(() => setLoading(false));
  }, [accountId]);

  if (loading) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;
  if (error)   return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;

  if (properties.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-6 text-center space-y-2">
        <Building2 size={20} className="text-slate-300 mx-auto" />
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("plAdvanced.str.noProperties")}</p>
      </div>
    );
  }

  const needle   = query.trim().toLowerCase();
  const filtered = needle
    ? properties.filter((p) =>
        (p.address || "").toLowerCase().includes(needle) ||
        (p.city    || "").toLowerCase().includes(needle)
      )
    : properties;

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
        {t("plAdvanced.str.selectProperty")}
      </p>

      {/* Search */}
      {properties.length > 4 && (
        <div className="relative">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("plAdvanced.str.searchProperties")}
            className="w-full text-sm pl-8 pr-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      <div className="space-y-2">
        {filtered.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onSelect(p)}
            className="w-full text-left rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-3 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/30 dark:hover:bg-blue-950/10 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Building2 size={14} className="text-slate-400 shrink-0" />
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                  {p.address}
                  {p.city && <span className="text-slate-400 font-normal ml-1">· {p.city}</span>}
                </p>
              </div>
              {p.market && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 uppercase shrink-0">
                  {p.market}
                </span>
              )}
            </div>
          </button>
        ))}
        {filtered.length === 0 && needle && (
          <p className="text-sm text-slate-400 text-center py-4">{t("common.noData")}</p>
        )}
      </div>
    </div>
  );
}

// ── Next recommended action ───────────────────────────────────────────────────

function NextAction({ missing, t }) {
  if (!missing || missing.length === 0) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 px-3 py-2">
        <CheckCircle2 size={13} className="text-green-600 dark:text-green-400 shrink-0" />
        <p className="text-xs text-green-700 dark:text-green-300 font-medium">
          {t("plAdvanced.str.nextAction.allDone")}
        </p>
      </div>
    );
  }

  const actionMap = {
    registration:    "addReg",
    safety_checklist:"completeChecklist",
    platform_ref:    "addPlatform",
  };
  const key = actionMap[missing[0]] || "addReg";

  return (
    <div className="flex items-center gap-2 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 px-3 py-2">
      <Sparkles size={13} className="text-blue-500 shrink-0" />
      <div>
        <p className="text-[11px] font-medium text-blue-700 dark:text-blue-400">{t("plAdvanced.str.nextAction")}</p>
        <p className="text-xs text-slate-700 dark:text-slate-300">{t(`plAdvanced.str.nextAction.${key}`)}</p>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PlStrCompliancePanel({ accountId, propertyId: propPropertyId }) {
  const { t } = useI18n();

  const [selectedProperty, setSelectedProperty] = useState(
    propPropertyId ? { id: propPropertyId } : null,
  );
  const propertyId = selectedProperty?.id || null;

  const [record, setRecord]     = useState(null);
  const [loading, setLoading]   = useState(false);
  const [saving, setSaving]     = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError]       = useState(null);
  const [dirty, setDirty]       = useState(false);

  // Form state
  const [regNumber, setRegNumber]       = useState("");
  const [regStatus, setRegStatus]       = useState("not_started");
  const [regExpiry, setRegExpiry]       = useState("");
  const [regNotes,  setRegNotes]        = useState("");
  const [checklist, setChecklist]       = useState({});
  const [platforms, setPlatforms]       = useState([]);
  const [reportStatus, setReportStatus] = useState("not_ready");
  const [reportNotes,  setReportNotes]  = useState("");

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getStrProperty({ accountId, propertyId });
      if (data) {
        setRecord(data);
        setRegNumber(data.registration_number        || "");
        setRegStatus(data.registration_status        || "not_started");
        setRegExpiry(data.registration_expiry_date   || "");
        setRegNotes(data.registration_notes          || "");
        setChecklist(data.safety_checklist           || {});
        setPlatforms(data.platform_refs              || []);
        setReportStatus(data.reporting_readiness_status || "not_ready");
        setReportNotes(data.reporting_readiness_notes   || "");
      } else {
        setRecord(null);
      }
    } catch {
      setError(t("plAdvanced.str.loadError"));
    } finally {
      setLoading(false);
      setDirty(false);
    }
  }, [accountId, propertyId]);

  useEffect(() => { load(); }, [load]);

  function updateChecklist(key, status) {
    setChecklist((prev) => ({ ...prev, [key]: status }));
    setDirty(true);
  }

  function addPlatformRef() {
    setPlatforms((prev) => [...prev, { platform: "airbnb", listing_id: "", listing_url: "", is_active: true }]);
    setDirty(true);
  }

  function updatePlatformRef(idx, updates) {
    setPlatforms((prev) => prev.map((p, i) => (i === idx ? { ...p, ...updates } : p)));
    setDirty(true);
  }

  function removePlatformRef(idx) {
    setPlatforms((prev) => prev.filter((_, i) => i !== idx));
    setDirty(true);
  }

  async function handleSave() {
    if (!propertyId) return;
    setSaving(true);
    setError(null);
    setSaveSuccess(false);
    try {
      await upsertStrProperty({
        accountId,
        propertyId,
        registrationNumber:        regNumber   || null,
        registrationStatus:        regStatus,
        registrationExpiryDate:    regExpiry   || null,
        registrationNotes:         regNotes    || null,
        safetyChecklist:           checklist,
        platformRefs:              platforms,
        reportingReadinessStatus:  reportStatus,
        reportingReadinessNotes:   reportNotes || null,
      });
      await load();
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch {
      setError(t("plAdvanced.str.saveError"));
    } finally {
      setSaving(false);
    }
  }

  // ── No property selected — show selector ────────────────────────────────────

  if (!propertyId) {
    return (
      <div className="space-y-4">
        <PropertySelector accountId={accountId} onSelect={setSelectedProperty} t={t} />
      </div>
    );
  }

  const currentData = {
    ...(record || {}),
    registration_status: regStatus,
    safety_checklist:    checklist,
    platform_refs:       platforms,
  };
  const readinessScore = calcStrReadinessScore(currentData);
  const missing        = getStrMissingItems(currentData);

  return (
    <div className="space-y-5">
      {/* Back to property selector */}
      {!propPropertyId && (
        <button
          type="button"
          onClick={() => { setSelectedProperty(null); setRecord(null); setDirty(false); }}
          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
        >
          ← {t("plAdvanced.str.changeProperty")}
          {selectedProperty?.address && (
            <span className="text-slate-500 font-normal ml-1 truncate max-w-[200px]">
              · {selectedProperty.address}
            </span>
          )}
        </button>
      )}

      {/* Next recommended action */}
      <NextAction missing={missing} t={t} />

      {/* Readiness summary */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t("plAdvanced.str.readinessTitle")}
          </p>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
            aria-label={t("common.refresh")}
          >
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
        <ReadinessBar score={readinessScore} />
      </div>

      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {!loading && (
        <>
          {/* 1 — Registration */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t("plAdvanced.str.registrationTitle")}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("plAdvanced.str.registrationNumber")}
                </label>
                <input
                  type="text"
                  value={regNumber}
                  onChange={(e) => { setRegNumber(e.target.value); setDirty(true); }}
                  placeholder="PL-STR-XXXXX"
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("plAdvanced.str.registrationStatus")}
                </label>
                <select
                  value={regStatus}
                  onChange={(e) => { setRegStatus(e.target.value); setDirty(true); }}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {REGISTRATION_STATUSES.map((s) => (
                    <option key={s} value={s}>{t(`plAdvanced.str.regStatus.${s}`)}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("plAdvanced.str.registrationExpiry")}
                </label>
                <input
                  type="date"
                  value={regExpiry}
                  onChange={(e) => { setRegExpiry(e.target.value); setDirty(true); }}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("plAdvanced.str.registrationNotes")}
                </label>
                <input
                  type="text"
                  value={regNotes}
                  onChange={(e) => { setRegNotes(e.target.value); setDirty(true); }}
                  placeholder={t("plAdvanced.str.registrationNotesPlaceholder")}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* 2 — Safety readiness */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t("plAdvanced.str.safetyTitle")}
            </p>
            {STR_SAFETY_KEYS.map((key) => (
              <SafetyCheckItem
                key={key}
                itemKey={key}
                status={checklist[key] || "pending"}
                onChange={updateChecklist}
                t={t}
              />
            ))}
          </div>

          {/* 3 — Platform listings */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                {t("plAdvanced.str.platformRefs")}
              </p>
              <button
                type="button"
                onClick={addPlatformRef}
                className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
              >
                + {t("plAdvanced.str.addPlatform")}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              {t("plAdvanced.str.platformDisclaimer")}
            </p>
            {platforms.map((p, idx) => (
              <div key={idx} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <select
                    value={p.platform}
                    onChange={(e) => updatePlatformRef(idx, { platform: e.target.value })}
                    className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none"
                  >
                    {STR_PLATFORMS.map((pl) => (
                      <option key={pl} value={pl}>{t(`plAdvanced.str.platform.${pl}`)}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={p.listing_id || ""}
                    placeholder={t("plAdvanced.str.listingId")}
                    onChange={(e) => updatePlatformRef(idx, { listing_id: e.target.value })}
                    className="flex-1 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => removePlatformRef(idx)}
                    className="text-slate-400 hover:text-red-500 text-lg leading-none"
                    aria-label="Remove"
                  >
                    ×
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* 4 — Reporting readiness */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              {t("plAdvanced.str.reportingTitle")}
            </p>
            <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
              {t("plAdvanced.str.reportingDisclaimer")}
            </p>
            <div className="flex gap-2 flex-wrap">
              {REPORTING_STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setReportStatus(s); setDirty(true); }}
                  className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                    reportStatus === s
                      ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                      : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {t(`plAdvanced.str.reportStatus.${s}`)}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={reportNotes}
              onChange={(e) => { setReportNotes(e.target.value); setDirty(true); }}
              placeholder={t("plAdvanced.str.reportingNotesPlaceholder")}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}
          {saveSuccess && (
            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
              <CheckCircle2 size={12} /> {t("plAdvanced.str.saveSuccess")}
            </p>
          )}

          {dirty && (
            <button
              type="button"
              disabled={saving}
              onClick={handleSave}
              className="w-full text-sm px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <Save size={14} />
              {saving ? t("common.loading") : t("common.save")}
            </button>
          )}
        </>
      )}
    </div>
  );
}
