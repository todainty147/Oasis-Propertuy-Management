import Card from "./Card";

function getDocumentTagLabel(tag, t) {
  const value = String(tag || "").trim().toUpperCase();
  return t(`documents.tag.${value}`, { defaultValue: value || tag || "—" });
}

export default function TenantDocumentsOverview({ groups, t }) {
  return (
    <Card className="p-5">
      <h2 className="text-lg font-semibold text-slate-900">{t("tenantPortal.documents.title")}</h2>
      <p className="mt-1 text-sm text-slate-600">{t("tenantPortal.documents.trustBody")}</p>

      <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("tenantPortal.card.documents")}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{groups.total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("tenantPortal.documents.recentTitle")}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{groups.recent.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("tenantPortal.documents.olderTitle")}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{groups.older.length}</p>
        </div>
      </div>

      {groups.total > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">{t("tenantPortal.documents.recentTitle")}</h3>
          <div className="mt-3 space-y-3">
            {(groups.recent.length > 0 ? groups.recent : groups.older).slice(0, 3).map((doc) => (
              <div key={doc.id} className="rounded-lg border border-slate-200 px-3 py-3">
                <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                {doc.tags?.[0] ? (
                  <p className="mt-1 text-xs text-slate-500">
                    {getDocumentTagLabel(doc.tags[0], t)}
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
