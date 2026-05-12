import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, RefreshCw, Save } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { getStrProperty, upsertStrProperty } from "../../services/plStrService";
import { calcStrReadinessScore, getStrMissingItems, STR_SAFETY_KEYS, STR_PLATFORMS } from "../../utils/plAdvancedUtils";

const REGISTRATION_STATUSES = ["not_started", "pending", "registered", "expired"];
const REPORTING_STATUSES    = ["not_ready", "partial", "ready"];

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

export default function PlStrCompliancePanel({ accountId, propertyId }) {
  const { t }           = useI18n();
  const [record, setRecord]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState(null);
  const [dirty,   setDirty]   = useState(false);

  // Form state
  const [regNumber, setRegNumber]         = useState("");
  const [regStatus, setRegStatus]         = useState("not_started");
  const [regExpiry, setRegExpiry]         = useState("");
  const [regNotes,  setRegNotes]          = useState("");
  const [checklist, setChecklist]         = useState({});
  const [platforms, setPlatforms]         = useState([]);
  const [reportStatus, setReportStatus]   = useState("not_ready");
  const [reportNotes,  setReportNotes]    = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getStrProperty({ accountId, propertyId });
      if (data) {
        setRecord(data);
        setRegNumber(data.registration_number   || "");
        setRegStatus(data.registration_status   || "not_started");
        setRegExpiry(data.registration_expiry_date || "");
        setRegNotes(data.registration_notes     || "");
        setChecklist(data.safety_checklist      || {});
        setPlatforms(data.platform_refs         || []);
        setReportStatus(data.reporting_readiness_status || "not_ready");
        setReportNotes(data.reporting_readiness_notes   || "");
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
    setSaving(true);
    setError(null);
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
    } catch {
      setError(t("plAdvanced.str.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const currentData = record
    ? { ...record, registration_status: regStatus, safety_checklist: checklist, platform_refs: platforms }
    : null;
  const readinessScore = calcStrReadinessScore(currentData);
  const missing        = getStrMissingItems(currentData);

  if (loading) return <p className="text-sm text-slate-400">{t("common.loading")}</p>;

  return (
    <div className="space-y-5">
      {/* Disclaimer */}
      <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2">
        <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 dark:text-amber-300">
          {t("plAdvanced.str.disclaimer")}
        </p>
      </div>

      {/* Readiness summary */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t("plAdvanced.str.readinessTitle")}
          </p>
          <button type="button" onClick={load} disabled={loading}
            className="text-slate-400 hover:text-slate-600">
            <RefreshCw size={14} />
          </button>
        </div>
        <ReadinessBar score={readinessScore} />
        {missing.length > 0 && (
          <div className="space-y-1">
            {missing.map((m) => (
              <div key={m} className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-300">
                <AlertTriangle size={10} />
                {t(`plAdvanced.str.missing.${m}`)}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Registration */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t("plAdvanced.str.registrationTitle")}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t("plAdvanced.str.registrationNumber")}
            </label>
            <input type="text" value={regNumber} onChange={(e) => { setRegNumber(e.target.value); setDirty(true); }}
              placeholder="PL-STR-XXXXX"
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {t("plAdvanced.str.registrationStatus")}
            </label>
            <select value={regStatus} onChange={(e) => { setRegStatus(e.target.value); setDirty(true); }}
              className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {REGISTRATION_STATUSES.map((s) => (
                <option key={s} value={s}>{t(`plAdvanced.str.regStatus.${s}`)}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
            {t("plAdvanced.str.registrationNotes")}
          </label>
          <input type="text" value={regNotes} onChange={(e) => { setRegNotes(e.target.value); setDirty(true); }}
            placeholder={t("plAdvanced.str.registrationNotesPlaceholder")}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
        </div>
      </div>

      {/* Safety checklist */}
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

      {/* Platform references */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("plAdvanced.str.platformRefs")}
          </p>
          <button type="button" onClick={addPlatformRef}
            className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
            + {t("plAdvanced.str.addPlatform")}
          </button>
        </div>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
          {t("plAdvanced.str.platformDisclaimer")}
        </p>
        {platforms.map((p, idx) => (
          <div key={idx} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <select value={p.platform} onChange={(e) => updatePlatformRef(idx, { platform: e.target.value })}
                className="text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none">
                {STR_PLATFORMS.map((pl) => (
                  <option key={pl} value={pl}>{t(`plAdvanced.str.platform.${pl}`)}</option>
                ))}
              </select>
              <input type="text" value={p.listing_id || ""} placeholder={t("plAdvanced.str.listingId")}
                onChange={(e) => updatePlatformRef(idx, { listing_id: e.target.value })}
                className="flex-1 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none" />
              <button type="button" onClick={() => removePlatformRef(idx)}
                className="text-slate-400 hover:text-red-500">×</button>
            </div>
          </div>
        ))}
      </div>

      {/* Reporting readiness */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-3">
        <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
          {t("plAdvanced.str.reportingTitle")}
        </p>
        <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
          {t("plAdvanced.str.reportingDisclaimer")}
        </p>
        <div className="flex gap-2">
          {REPORTING_STATUSES.map((s) => (
            <button key={s} type="button" onClick={() => { setReportStatus(s); setDirty(true); }}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors ${
                reportStatus === s
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                  : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}>
              {t(`plAdvanced.str.reportStatus.${s}`)}
            </button>
          ))}
        </div>
        <input type="text" value={reportNotes} onChange={(e) => { setReportNotes(e.target.value); setDirty(true); }}
          placeholder={t("plAdvanced.str.reportingNotesPlaceholder")}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {dirty && (
        <button type="button" disabled={saving} onClick={handleSave}
          className="w-full text-sm px-4 py-2.5 rounded-xl bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2">
          <Save size={14} />
          {saving ? t("common.loading") : t("common.save")}
        </button>
      )}
    </div>
  );
}
