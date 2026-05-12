import { useState } from "react";
import { ChevronDown, ChevronRight, Gauge, Plus } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { addMeterReading } from "../../services/evidencePackService";
import { validateMeterReading, METER_TYPE_KEYS } from "../../utils/evidencePackUtils";

// ── Reading row display ──────────────────────────────────────────────────────

function ReadingRow({ reading, t }) {
  const d = reading.read_at ? new Date(reading.read_at).toLocaleDateString() : "—";
  return (
    <div className="flex items-center gap-3 py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 text-sm">
      <span className="text-xs font-medium w-24 text-slate-500 dark:text-slate-400 shrink-0">
        {t(`meter.type.${reading.meter_type}`)}
      </span>
      <span className="flex-1 font-mono text-slate-800 dark:text-slate-200">
        {reading.reading_value}
        {reading.unit && <span className="ml-1 text-xs text-slate-400">{reading.unit}</span>}
      </span>
      <span className="text-xs text-slate-400">{d}</span>
    </div>
  );
}

// ── Main MeterReadingEntry ───────────────────────────────────────────────────

export default function MeterReadingEntry({
  accountId,
  propertyId,
  tenantId,
  handoverProtocolId = null,
  readings           = [],
  onSaved,
}) {
  const { t }               = useI18n();
  const [open, setOpen]     = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [meterType,     setMeterType]     = useState("electricity");
  const [readingValue,  setReadingValue]  = useState("");
  const [unit,          setUnit]          = useState("");
  const [readAt,        setReadAt]        = useState(() => new Date().toISOString().slice(0, 16));
  const [notes,         setNotes]         = useState("");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);

  function resetForm() {
    setMeterType("electricity");
    setReadingValue("");
    setUnit("");
    setReadAt(new Date().toISOString().slice(0, 16));
    setNotes("");
    setError(null);
    setShowForm(false);
  }

  async function handleSave() {
    const validationError = validateMeterReading({ meterType, readingValue });
    if (validationError) {
      setError(t(`meter.error.${validationError}`));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await addMeterReading({
        accountId,
        propertyId,
        meterType,
        readingValue,
        unit:              unit || null,
        readAt:            readAt ? new Date(readAt).toISOString() : null,
        notes:             notes || null,
        tenantId,
        handoverProtocolId,
      });
      resetForm();
      onSaved?.();
    } catch {
      setError(t("meter.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Gauge size={16} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("meter.title")}
          </p>
          {readings.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              {readings.length}
            </span>
          )}
        </div>
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-800 pt-3 space-y-3">
          {/* Existing readings */}
          {readings.length > 0 && (
            <div className="rounded-lg border border-slate-100 dark:border-slate-800 px-4 py-1">
              {readings.map((r) => (
                <ReadingRow key={r.id} reading={r} t={t} />
              ))}
            </div>
          )}

          {/* Entry form */}
          {showForm ? (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("meter.addReading")}
              </p>

              {/* Meter type */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("meter.typeLabel")}
                </label>
                <select
                  value={meterType}
                  onChange={(e) => setMeterType(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {METER_TYPE_KEYS.map((k) => (
                    <option key={k} value={k}>{t(`meter.type.${k}`)}</option>
                  ))}
                </select>
              </div>

              {/* Reading value + unit */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t("meter.reading")} *
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={readingValue}
                    onChange={(e) => setReadingValue(e.target.value)}
                    placeholder="12345.6"
                    className="w-full text-sm font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t("meter.unit")}
                  </label>
                  <input
                    type="text"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="kWh, m³…"
                    className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Date */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("meter.readAt")}
                </label>
                <input
                  type="datetime-local"
                  value={readAt}
                  onChange={(e) => setReadAt(e.target.value)}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("meter.notes")}
                </label>
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={t("meter.notesPlaceholder")}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <p className="text-[11px] text-slate-400 dark:text-slate-500">
                {t("meter.ocrNote")}
              </p>

              {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-blue-600 dark:hover:text-blue-300 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={14} />
              {t("meter.addReading")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
