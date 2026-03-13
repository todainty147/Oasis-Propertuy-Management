import { useEffect, useState } from "react";
import { useI18n } from "../../context/I18nContext";

function toIsoOrNull(v) {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function CreateWorkOrderDrawer({
  open,
  request = null,
  contractors = [],
  saving = false,
  onClose,
  onSubmit,
}) {
  const { t } = useI18n();
  const [contractorId, setContractorId] = useState("");
  const [contractorName, setContractorName] = useState("");
  const [contractorPhone, setContractorPhone] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (!open) return;
    setContractorId("");
    setContractorName("");
    setContractorPhone("");
    setScheduledAt("");
    setNotes(request?.description ? `Zgłoszenie: ${request.description}` : "");
  }, [open, request]);

  useEffect(() => {
    if (!contractorId) return;
    const c = (contractors || []).find((x) => x.id === contractorId);
    setContractorName(c?.name || "");
    setContractorPhone(c?.phone || "");
  }, [contractorId, contractors]);

  if (!open || !request) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/30" onClick={saving ? undefined : onClose} />
      <div className="absolute right-0 top-0 h-full w-[96vw] max-w-xl bg-white border-l shadow-xl p-4 overflow-y-auto">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">{t("maintenance.drawer.create")}</h3>
            <p className="text-sm text-slate-500 mt-1">{request.title || t("maintenance.drawer.requestWithoutTitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="text-sm px-2 py-1 rounded border hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.close")}
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorFromList")}</label>
            <select
              value={contractorId}
              onChange={(e) => setContractorId(e.target.value)}
              disabled={saving}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-50"
            >
              <option value="">{t("maintenance.drawer.unassigned")}</option>
              {(contractors || []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorName")}</label>
              <input
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                disabled={saving}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder={t("maintenance.drawer.optional")}
              />
            </div>
            <div>
              <label className="text-xs text-slate-500">{t("maintenance.drawer.contractorPhone")}</label>
              <input
                value={contractorPhone}
                onChange={(e) => setContractorPhone(e.target.value)}
                disabled={saving}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
                placeholder={t("maintenance.drawer.optional")}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500">{t("maintenance.drawer.scheduleOptional")}</label>
            <input
              type="datetime-local"
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              disabled={saving}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm disabled:bg-slate-50"
            />
          </div>

          <div>
            <label className="text-xs text-slate-500">{t("maintenance.drawer.notes")}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={saving}
              className="mt-1 w-full border rounded-lg px-3 py-2 text-sm min-h-[130px] disabled:bg-slate-50"
              placeholder={t("maintenance.drawer.optional")}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-3 py-2 text-sm rounded-lg border hover:bg-slate-50 disabled:opacity-50"
          >
            {t("common.cancel")}
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                contractorId: contractorId || null,
                contractorName: contractorName || null,
                contractorPhone: contractorPhone || null,
                scheduledAt: toIsoOrNull(scheduledAt),
                notes: notes || null,
              })
            }
            disabled={saving}
            className={`px-3 py-2 text-sm rounded-lg text-white ${
              saving ? "bg-slate-400" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {saving ? t("maintenance.drawer.saving") : t("maintenance.drawer.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
