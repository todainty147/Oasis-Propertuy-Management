import { useCallback, useEffect, useState } from "react";
import { Globe, Mail, Phone, Plus, RefreshCw, Users, X } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { listPartners, createPartner } from "../../services/plPartnerService";
import { PARTNER_TYPES, filterPartners } from "../../utils/plAdvancedUtils";

const CONTACT_ICONS = {
  phone:   Phone,
  email:   Mail,
  website: Globe,
};

const TYPE_COLORS = {
  notary:           "bg-purple-100  text-purple-700  dark:bg-purple-950/30 dark:text-purple-300",
  solicitor:        "bg-blue-100    text-blue-700    dark:bg-blue-950/30   dark:text-blue-300",
  accountant:       "bg-green-100   text-green-700   dark:bg-green-950/30  dark:text-green-300",
  property_manager: "bg-amber-100   text-amber-700   dark:bg-amber-950/30  dark:text-amber-300",
};

const CONTACT_METHODS = ["phone", "email", "website"];

// ── Partner card ──────────────────────────────────────────────────────────────

function PartnerCard({ partner, t }) {
  const ContactIcon = CONTACT_ICONS[partner.contact_method] || Globe;

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{partner.name}</p>
          {partner.company_name && (
            <p className="text-xs text-slate-500 dark:text-slate-400">{partner.company_name}</p>
          )}
        </div>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${TYPE_COLORS[partner.partner_type] || TYPE_COLORS.notary}`}>
          {t(`plAdvanced.partners.type.${partner.partner_type}`)}
        </span>
      </div>

      <p className="text-xs text-slate-500 dark:text-slate-400">
        📍 {partner.service_area}
      </p>

      <div className="flex items-center gap-1.5 text-sm text-slate-700 dark:text-slate-300">
        <ContactIcon size={13} className="text-slate-400 shrink-0" />
        {partner.contact_method === "website"
          ? (
            <a href={partner.contact_value} target="_blank" rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline truncate">
              {partner.contact_value}
            </a>
          )
          : <span className="truncate">{partner.contact_value}</span>
        }
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
        {t("plAdvanced.partners.contactDisclaimer")}
      </p>
    </div>
  );
}

// ── Add partner form ──────────────────────────────────────────────────────────

function AddPartnerForm({ accountId, market, onSaved, onCancel, t }) {
  const [name,          setName]          = useState("");
  const [companyName,   setCompanyName]   = useState("");
  const [partnerType,   setPartnerType]   = useState(PARTNER_TYPES[0]);
  const [serviceArea,   setServiceArea]   = useState("");
  const [contactMethod, setContactMethod] = useState("phone");
  const [contactValue,  setContactValue]  = useState("");
  const [notes,         setNotes]         = useState("");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState(null);

  async function handleSave() {
    if (!name.trim() || !serviceArea.trim() || !contactValue.trim()) {
      setError(t("plAdvanced.partners.addForm.requiredError"));
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createPartner({
        accountId,
        market,
        partnerType,
        name:          name.trim(),
        companyName:   companyName.trim() || null,
        serviceArea:   serviceArea.trim(),
        contactMethod,
        contactValue:  contactValue.trim(),
        internalNotes: notes.trim() || null,
      });
      onSaved();
    } catch {
      setError(t("plAdvanced.partners.addForm.saveError"));
    } finally {
      setSaving(false);
    }
  }

  const inputCls = "w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const labelCls = "block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1";

  return (
    <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
          {t("plAdvanced.partners.addForm.title")}
        </p>
        <button type="button" onClick={onCancel} className="text-slate-400 hover:text-slate-600">
          <X size={14} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>{t("plAdvanced.partners.addForm.name")} *</label>
          <input type="text" value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t("plAdvanced.partners.addForm.namePlaceholder")} className={inputCls} />
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={labelCls}>{t("plAdvanced.partners.addForm.company")}</label>
          <input type="text" value={companyName} onChange={(e) => setCompanyName(e.target.value)}
            placeholder={t("plAdvanced.partners.addForm.companyPlaceholder")} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t("plAdvanced.partners.addForm.type")} *</label>
          <select value={partnerType} onChange={(e) => setPartnerType(e.target.value)} className={inputCls}>
            {PARTNER_TYPES.map((pt) => (
              <option key={pt} value={pt}>{t(`plAdvanced.partners.type.${pt}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("plAdvanced.partners.addForm.area")} *</label>
          <input type="text" value={serviceArea} onChange={(e) => setServiceArea(e.target.value)}
            placeholder={t("plAdvanced.partners.addForm.areaPlaceholder")} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={labelCls}>{t("plAdvanced.partners.addForm.contactMethod")}</label>
          <select value={contactMethod} onChange={(e) => setContactMethod(e.target.value)} className={inputCls}>
            {CONTACT_METHODS.map((m) => (
              <option key={m} value={m}>{t(`plAdvanced.partners.contactMethod.${m}`)}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("plAdvanced.partners.addForm.contactValue")} *</label>
          <input type="text" value={contactValue} onChange={(e) => setContactValue(e.target.value)}
            placeholder={t("plAdvanced.partners.addForm.contactValuePlaceholder")} className={inputCls} />
        </div>
      </div>

      <div>
        <label className={labelCls}>{t("plAdvanced.partners.addForm.notes")}</label>
        <input type="text" value={notes} onChange={(e) => setNotes(e.target.value)}
          placeholder={t("plAdvanced.partners.addForm.notesPlaceholder")} className={inputCls} />
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 italic">
        {t("plAdvanced.partners.addForm.disclaimer")}
      </p>

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel}
          className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400">
          {t("common.cancel")}
        </button>
        <button type="button" disabled={saving} onClick={handleSave}
          className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50">
          {saving ? t("common.loading") : t("common.save")}
        </button>
      </div>
    </div>
  );
}

// ── Improved empty state ──────────────────────────────────────────────────────

function EmptyState({ t, onAdd }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-6 text-center space-y-3">
      <Users size={28} className="text-slate-300 mx-auto" />
      <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
        {t("plAdvanced.partners.emptyNoPartners")}
      </p>
      <p className="text-xs text-slate-400 dark:text-slate-500 max-w-sm mx-auto leading-relaxed">
        {t("plAdvanced.partners.emptyBody")}
      </p>
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 mx-auto"
      >
        <Plus size={12} />
        {t("plAdvanced.partners.addPartner")}
      </button>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function PlPartnerPanel({ market = "pl", accountId }) {
  const { t }                       = useI18n();
  const [partners, setPartners]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [typeFilter, setTypeFilter] = useState(null);
  const [areaFilter, setAreaFilter] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPartners({ market });
      setPartners(data);
    } catch {
      setError(t("plAdvanced.partners.loadError"));
    } finally {
      setLoading(false);
    }
  }, [market]);

  useEffect(() => { load(); }, [load]);

  const filtered = filterPartners(partners, {
    partnerType: typeFilter || undefined,
    serviceArea: areaFilter || undefined,
  });

  const noPartnersAtAll = !loading && !error && partners.length === 0;
  const noFilteredMatch = !loading && !error && partners.length > 0 && filtered.length === 0;

  return (
    <div className="space-y-4">
      {/* Not endorsed note */}
      <p className="text-xs text-slate-400 dark:text-slate-500 italic">
        {t("plAdvanced.partners.notEndorsement")}
      </p>

      {/* Header + actions */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t("plAdvanced.partners.title")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("plAdvanced.partners.subtitle")}
          </p>
        </div>
        <div className="flex gap-2 items-center shrink-0">
          <button
            type="button"
            onClick={load}
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
              className="text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5"
            >
              <Plus size={12} />
              {t("plAdvanced.partners.addPartner")}
            </button>
          )}
        </div>
      </div>

      {/* Add partner form */}
      {showForm && (
        <AddPartnerForm
          accountId={accountId}
          market={market}
          t={t}
          onSaved={() => { setShowForm(false); load(); }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* Filters — only show if there are partners */}
      {partners.length > 0 && !showForm && (
        <div className="space-y-2">
          <div className="flex gap-1.5 flex-wrap">
            <button type="button" onClick={() => setTypeFilter(null)}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                !typeFilter
                  ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                  : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
              }`}>
              {t("common.all")}
            </button>
            {PARTNER_TYPES.map((pt) => (
              <button key={pt} type="button" onClick={() => setTypeFilter(pt)}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  typeFilter === pt
                    ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/30 dark:text-blue-300"
                    : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
                }`}>
                {t(`plAdvanced.partners.type.${pt}`)}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={areaFilter}
            onChange={(e) => setAreaFilter(e.target.value)}
            placeholder={t("plAdvanced.partners.searchArea")}
            className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {noPartnersAtAll && !showForm && (
        <EmptyState t={t} onAdd={() => setShowForm(true)} />
      )}

      {noFilteredMatch && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
          {t("plAdvanced.partners.empty")}
        </p>
      )}

      {filtered.map((p) => (
        <PartnerCard key={p.id} partner={p} t={t} />
      ))}

      {filtered.length > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
          {t("plAdvanced.partners.footerDisclaimer")}
        </p>
      )}
    </div>
  );
}
