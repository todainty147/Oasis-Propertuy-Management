import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import Skeleton from "./ui/Skeleton";
import { useI18n } from "../context/I18nContext";
import { useRealtimeTables } from "../hooks/useRealtimeTables";
import { isUuid } from "../utils/validation";
import {
  downloadDocument,
  fetchDocuments,
  getDocumentPreviewUrl,
} from "../services/documentService";
import {
  completeComplianceItem,
  createComplianceItem,
  linkComplianceDocument,
  listComplianceItems,
  listComplianceDocumentLinks,
  listMissingComplianceSetup,
  unlinkComplianceDocument,
} from "../services/complianceService";

const CATEGORY_OPTIONS = [
  "gas_safety",
  "epc_expiry",
  "electrical_inspection",
  "insurance_renewal",
  "fire_alarm_inspection",
  "smoke_alarm_check",
  "landlord_licensing",
  "document_expiry",
  "other",
];

function dueDays(value) {
  if (!value) return null;
  const due = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

function dueTone(days) {
  if (!Number.isFinite(days)) return "border-slate-200 bg-slate-50 text-slate-700";
  if (days < 0) return "border-rose-200 bg-rose-50 text-rose-700";
  if (days <= 30) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

export default function PropertyComplianceCard({ accountId, propertyId }) {
  const { t } = useI18n();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [rows, setRows] = useState([]);
  const [missingRows, setMissingRows] = useState([]);
  const [propertyDocuments, setPropertyDocuments] = useState([]);
  const [linkedDocuments, setLinkedDocuments] = useState([]);
  const [linkSelections, setLinkSelections] = useState({});
  const [form, setForm] = useState({
    title: "",
    category: "gas_safety",
    dueDate: "",
    reminderWindowDays: "30",
    recurrenceIntervalMonths: "12",
    notes: "",
  });

  function categoryLabel(category) {
    const key = String(category || "other").toLowerCase();
    const translated = t(`compliance.category.${key}`);
    return translated === `compliance.category.${key}` ? category || t("compliance.category.other") : translated;
  }

  async function load() {
    if (!accountId || !propertyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    if (!isUuid(propertyId)) {
      setRows([]);
      setMissingRows([]);
      setPropertyDocuments([]);
      setLinkedDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [next, missing, docs] = await Promise.all([
        listComplianceItems({
          accountId,
          propertyId,
          includeClosed: true,
          limit: 50,
        }),
        listMissingComplianceSetup(accountId, { propertyId, limit: 12 }),
        fetchDocuments({
          accountId,
          propertyId,
        }),
      ]);
      const links = await listComplianceDocumentLinks({
        accountId,
        propertyId,
        complianceItemIds: next.map((row) => row.id),
      });
      setRows(next);
      setMissingRows(missing);
      setPropertyDocuments(Array.isArray(docs) ? docs : []);
      setLinkedDocuments(Array.isArray(links) ? links : []);
    } catch (e) {
      setRows([]);
      setMissingRows([]);
      setPropertyDocuments([]);
      setLinkedDocuments([]);
      setError(e?.message || t("compliance.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, propertyId]);

  useRealtimeTables({
    enabled: !!accountId && !!propertyId,
    subscriptions: [
      { channel: `property-compliance:${propertyId}`, table: "compliance_items", filter: `account_id=eq.${accountId}` },
      { channel: `property-compliance-links:${propertyId}`, table: "compliance_document_links", filter: `account_id=eq.${accountId}` },
      { channel: `property-compliance-documents:${propertyId}`, table: "documents", filter: `account_id=eq.${accountId}` },
    ],
    onChange: load,
  });

  const summary = useMemo(() => {
    let overdue = 0;
    let dueSoon = 0;
    let active = 0;
    for (const row of rows) {
      if (String(row?.status || "").toLowerCase() !== "active") continue;
      active += 1;
      const days = dueDays(row?.due_date);
      if (days < 0) overdue += 1;
      else if (days <= Number(row?.reminder_window_days || 30)) dueSoon += 1;
    }
    return { overdue, dueSoon, active };
  }, [rows]);

  async function handleCreate(e) {
    e.preventDefault();
    if (!accountId || !propertyId) return;
    setSaving(true);
    setError("");
    try {
      await createComplianceItem({
        accountId,
        propertyId,
        title: form.title,
        category: form.category,
        dueDate: form.dueDate,
        reminderWindowDays: form.reminderWindowDays,
        recurrenceIntervalMonths: form.recurrenceIntervalMonths,
        notes: form.notes,
      });
      setForm({
        title: "",
        category: form.category,
        dueDate: "",
        reminderWindowDays: form.reminderWindowDays,
        recurrenceIntervalMonths: form.recurrenceIntervalMonths,
        notes: "",
      });
      await load();
    } catch (e2) {
      setError(e2?.message || t("compliance.saveError"));
    } finally {
      setSaving(false);
    }
  }

  async function markComplete(id) {
    setError("");
    try {
      await completeComplianceItem(id);
      await load();
    } catch (e) {
      setError(e?.message || t("compliance.completeError"));
    }
  }

  async function handleLinkDocument(complianceItemId) {
    const documentId = linkSelections[complianceItemId];
    if (!documentId) return;
    setError("");
    try {
      await linkComplianceDocument({
        accountId,
        complianceItemId,
        documentId,
      });
      setLinkSelections((prev) => ({ ...prev, [complianceItemId]: "" }));
      await load();
    } catch (e) {
      setError(e?.message || t("compliance.linkSaveError"));
    }
  }

  async function handleUnlinkDocument(linkId) {
    setError("");
    try {
      await unlinkComplianceDocument(linkId);
      await load();
    } catch (e) {
      setError(e?.message || t("compliance.linkDeleteError"));
    }
  }

  async function handlePreviewDocument(doc) {
    try {
      const documentId = doc?.id || doc?.document_id || null;
      if (!documentId) throw new Error("Document id is required");
      const url = await getDocumentPreviewUrl({
        accountId: doc?.account_id || accountId,
        documentId,
        propertyId: doc?.property_id || propertyId,
        tenantId: doc?.tenant_id || null,
        scope: doc?.scope || null,
        visibility: doc?.visibility || null,
      });
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e?.message || t("documents.previewError"));
    }
  }

  async function handleDownloadDocument(doc) {
    try {
      const documentId = doc?.id || doc?.document_id || null;
      if (!documentId) throw new Error("Document id is required");
      await downloadDocument({
        filename: doc?.name,
        accountId: doc?.account_id || accountId,
        documentId,
        propertyId: doc?.property_id || propertyId,
        tenantId: doc?.tenant_id || null,
        scope: doc?.scope || null,
        visibility: doc?.visibility || null,
      });
    } catch (e) {
      setError(e?.message || t("documents.previewError"));
    }
  }

  function docsForComplianceItem(complianceItemId) {
    return linkedDocuments.filter((row) => String(row?.compliance_item_id) === String(complianceItemId));
  }

  function availableDocumentsForComplianceItem(complianceItemId) {
    const linkedIds = new Set(docsForComplianceItem(complianceItemId).map((row) => row?.document_id));
    return propertyDocuments.filter((doc) => !linkedIds.has(doc.id));
  }

  if (loading) {
    return (
      <Card className="p-4 bg-slate-50">
        <Skeleton className="h-5 w-48" />
        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, idx) => (
            <Skeleton key={idx} className="h-16" />
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 bg-slate-50">
      <div>
        <h3 className="text-base font-semibold text-slate-900">{t("compliance.title")}</h3>
        <p className="mt-1 text-sm text-slate-500">{t("compliance.subtitle")}</p>
      </div>

      {error ? <p className="mt-3 text-sm text-rose-700">{error}</p> : null}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("compliance.summary.active")}</p>
          <p className="mt-1 text-lg font-bold text-slate-900">{summary.active}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("compliance.summary.dueSoon")}</p>
          <p className="mt-1 text-lg font-bold text-amber-700">{summary.dueSoon}</p>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <p className="text-xs text-slate-500">{t("compliance.summary.overdue")}</p>
          <p className="mt-1 text-lg font-bold text-rose-700">{summary.overdue}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 xl:grid-cols-[1.2fr_1fr] gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          {missingRows.length > 0 ? (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-800">{t("compliance.missingTitle")}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {missingRows.map((row) => (
                  <span key={row.item_key} className="rounded-full border border-amber-300 bg-white px-2 py-0.5 text-xs text-amber-800">
                    {row.title === "Compliance calendar not set up"
                      ? t("compliance.missingSetup")
                      : categoryLabel(row.category)}
                  </span>
                ))}
              </div>
            </div>
          ) : null}
          {rows.length === 0 ? (
            <p className="text-sm text-slate-500">{t("compliance.empty")}</p>
          ) : (
            <div className="space-y-2">
              {rows.map((row) => {
                const days = dueDays(row?.due_date);
                const isActive = String(row?.status || "").toLowerCase() === "active";
                return (
                  <div key={row.id} className="rounded-lg border border-slate-200 px-3 py-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-medium text-slate-900">{row.title}</p>
                          <span className={`rounded-full border px-2 py-0.5 text-xs ${dueTone(days)}`}>
                            {t(`compliance.status.${String(row.status || "active").toLowerCase()}`)}
                          </span>
                          {Number(row?.recurrence_interval_months || 0) > 0 ? (
                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                              {t("compliance.recursEveryMonths", { count: Number(row.recurrence_interval_months || 0) })}
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-1 text-xs text-slate-500">
                          {categoryLabel(String(row.category || "other").toLowerCase())}
                          {" • "}
                          {row.due_date}
                        </p>
                        {row.notes ? <p className="mt-1 text-xs text-slate-600">{row.notes}</p> : null}
                        <div className="mt-2 space-y-2">
                          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                            {t("compliance.linkedDocuments")}
                          </p>
                          {docsForComplianceItem(row.id).length === 0 ? (
                            <p className="text-xs text-slate-500">{t("compliance.noLinkedDocuments")}</p>
                          ) : (
                            <div className="space-y-2">
                              {docsForComplianceItem(row.id).map((linkRow) => {
                                const doc = linkRow?.documents;
                                return (
                                  <div
                                    key={linkRow.id}
                                    className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5"
                                  >
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-medium text-slate-900">
                                        {doc?.name || "—"}
                                      </p>
                                      <p className="text-[11px] text-slate-500">{doc?.mime_type || "document"}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => handlePreviewDocument(doc)}
                                        className="text-xs text-slate-600 hover:text-slate-900"
                                      >
                                        {t("documents.preview")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDownloadDocument(doc)}
                                        className="text-xs text-slate-600 hover:text-slate-900"
                                      >
                                        {t("documents.download")}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleUnlinkDocument(linkRow.id)}
                                        className="text-xs text-rose-600 hover:text-rose-700"
                                      >
                                        {t("compliance.unlinkDocument")}
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="flex flex-col gap-2 md:flex-row">
                            <select
                              value={linkSelections[row.id] || ""}
                              onChange={(e) => setLinkSelections((prev) => ({ ...prev, [row.id]: e.target.value }))}
                              className="min-w-0 flex-1 rounded-lg border px-3 py-2 text-xs"
                            >
                              <option value="">{t("compliance.selectDocumentToLink")}</option>
                              {availableDocumentsForComplianceItem(row.id).map((doc) => (
                                <option key={doc.id} value={doc.id}>
                                  {doc.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleLinkDocument(row.id)}
                              disabled={!linkSelections[row.id]}
                              className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            >
                              {t("compliance.linkDocument")}
                            </button>
                          </div>
                        </div>
                      </div>
                      {isActive ? (
                        <button
                          type="button"
                          onClick={() => markComplete(row.id)}
                          className="rounded-lg border border-slate-300 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          {t("compliance.markComplete")}
                        </button>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <form onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
          <h4 className="text-sm font-semibold text-slate-900">{t("compliance.addTitle")}</h4>
          <label className="text-sm block">
            <span className="text-xs text-slate-500">{t("compliance.titleLabel")}</span>
            <input
              value={form.title}
              onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              placeholder={t("compliance.titlePlaceholder")}
            />
          </label>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="text-sm">
              <span className="text-xs text-slate-500">{t("compliance.categoryLabel")}</span>
              <select
                value={form.category}
                onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              >
                {CATEGORY_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {t(`compliance.category.${option}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-xs text-slate-500">{t("compliance.dueDateLabel")}</span>
              <input
                type="date"
                value={form.dueDate}
                onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
              />
            </label>
          </div>
          <label className="text-sm block">
            <span className="text-xs text-slate-500">{t("compliance.recurrenceLabel")}</span>
            <select
              value={form.recurrenceIntervalMonths}
              onChange={(e) => setForm((prev) => ({ ...prev, recurrenceIntervalMonths: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            >
              <option value="0">{t("compliance.recurrence.none")}</option>
              <option value="1">{t("compliance.recurrence.monthly")}</option>
              <option value="3">{t("compliance.recurrence.quarterly")}</option>
              <option value="6">{t("compliance.recurrence.every6Months")}</option>
              <option value="12">{t("compliance.recurrence.yearly")}</option>
            </select>
          </label>
          <label className="text-sm block">
            <span className="text-xs text-slate-500">{t("compliance.reminderWindowLabel")}</span>
            <input
              value={form.reminderWindowDays}
              onChange={(e) => setForm((prev) => ({ ...prev, reminderWindowDays: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm block">
            <span className="text-xs text-slate-500">{t("compliance.notesLabel")}</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-[96px]"
              placeholder={t("compliance.notesPlaceholder")}
            />
          </label>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className={`rounded-lg px-3 py-2 text-sm text-white ${saving ? "bg-slate-400" : "bg-slate-900 hover:bg-slate-800"}`}
            >
              {saving ? t("common.saving") : t("compliance.addAction")}
            </button>
          </div>
        </form>
      </div>
    </Card>
  );
}
