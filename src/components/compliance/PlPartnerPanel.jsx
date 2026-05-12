import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Mail, Phone, Globe, RefreshCw } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { listPartners } from "../../services/plPartnerService";
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

      {/* Disclaimer — always shown */}
      <div className="flex items-start gap-1.5">
        <AlertTriangle size={11} className="text-amber-500 shrink-0 mt-0.5" />
        <p className="text-[11px] text-amber-700 dark:text-amber-400">
          {t("plAdvanced.partners.contactDisclaimer")}
        </p>
      </div>
    </div>
  );
}

export default function PlPartnerPanel({ market = "pl" }) {
  const { t }               = useI18n();
  const [partners, setPartners]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [typeFilter, setTypeFilter]     = useState(null);
  const [areaFilter, setAreaFilter]     = useState("");

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

  return (
    <div className="space-y-4">
      {/* Global disclaimer */}
      <div className="rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 px-3 py-2 space-y-1">
        <div className="flex items-center gap-2">
          <AlertTriangle size={13} className="text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300">
            {t("plAdvanced.partners.notEndorsement")}
          </p>
        </div>
        <p className="text-[11px] text-amber-700 dark:text-amber-400 pl-5">
          {t("plAdvanced.partners.globalDisclaimer")}
        </p>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {t("plAdvanced.partners.title")}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t("plAdvanced.partners.subtitle")}
          </p>
        </div>
        <button type="button" onClick={load} disabled={loading}
          className="text-slate-400 hover:text-slate-600">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {/* Filters */}
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

        <input type="text" value={areaFilter} onChange={(e) => setAreaFilter(e.target.value)}
          placeholder={t("plAdvanced.partners.searchArea")}
          className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {loading && <p className="text-sm text-slate-400">{t("common.loading")}</p>}

      {!loading && !error && filtered.length === 0 && (
        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">
          {t("plAdvanced.partners.empty")}
        </p>
      )}

      {filtered.map((p) => (
        <PartnerCard key={p.id} partner={p} t={t} />
      ))}

      {/* Footer disclaimer */}
      {filtered.length > 0 && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 text-center">
          {t("plAdvanced.partners.footerDisclaimer")}
        </p>
      )}
    </div>
  );
}
