import Card from "./Card";

function getDocumentTagLabel(tag, t) {
  const value = String(tag || "").trim().toUpperCase();
  return t(`documents.tag.${value}`, { defaultValue: value || tag || "—" });
}

export default function TenantDocumentsOverview({ groups, t }) {
  const featuredRows =
    groups.attention.length > 0
      ? groups.attention
      : groups.current.length > 0
        ? groups.current
        : groups.recent.length > 0
          ? groups.recent
          : groups.older;

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
            {t("tenantPortal.documents.attentionTitle")}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{groups.attention.length}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t("tenantPortal.documents.currentTitle")}
          </p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{groups.current.length}</p>
        </div>
      </div>

      {groups.total > 0 ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
          <h3 className="text-sm font-semibold text-slate-900">{t("tenantPortal.documents.priorityTitle")}</h3>
          <div className="mt-3 space-y-3">
            {featuredRows.slice(0, 3).map((doc) => (
              <div key={doc.id} className="rounded-lg border border-slate-200 px-3 py-3">
                <p className="text-sm font-medium text-slate-900">{doc.name}</p>
                {doc.tenant_highlight === "action_required" ? (
                  <p className="mt-1 text-xs font-medium text-amber-700">{t("tenantPortal.documents.highlight.actionRequired")}</p>
                ) : doc.tenant_highlight === "current" ? (
                  <p className="mt-1 text-xs font-medium text-blue-700">{t("tenantPortal.documents.highlight.current")}</p>
                ) : null}
                {doc.tenant_highlight_note ? (
                  <p className="mt-1 text-xs text-slate-600">{doc.tenant_highlight_note}</p>
                ) : null}
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
