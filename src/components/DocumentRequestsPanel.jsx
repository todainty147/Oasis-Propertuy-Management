import { useEffect, useMemo, useRef, useState } from "react";
import Card from "./Card";
import {
  createDocumentRequest,
  fetchContractorsForDocumentRequests,
  fetchDocumentRequests,
  reviewDocumentRequestUpload,
  uploadDocumentRequestFile,
} from "../services/documentRequestService";

const REQUEST_TYPES = [
  "id_document",
  "bank_payment_receipt",
  "signed_agreement",
  "insurance_certificate",
  "contractor_terms",
  "other",
];

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isManagerRole(role) {
  return ["owner", "admin", "staff", "root", "super-admin", "super_admin"].includes(normalizeRole(role));
}

function fieldClasses(extra = "") {
  return `rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${extra}`;
}

function requestStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "accepted") return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-900";
  if (s === "rejected") return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900";
  if (s === "uploaded") return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900";
  if (s === "cancelled") return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700";
  return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900";
}

export default function DocumentRequestsPanel({
  accountId,
  permissionContext,
  tenants = [],
  t,
  mode = "manager",
}) {
  const role = permissionContext?.role;
  const normalizedRole = normalizeRole(role);
  const canManage = mode === "manager" && isManagerRole(role);
  const participantSubtitleKey = normalizedRole === "contractor"
    ? "documents.requests.participantSubtitleContractor"
    : "documents.requests.participantSubtitle";
  const emptyParticipantKey = normalizedRole === "contractor"
    ? "documents.requests.emptyParticipantContractor"
    : "documents.requests.emptyParticipant";
  const fileInputsRef = useRef({});
  const [requests, setRequests] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    targetRole: "tenant",
    tenantId: "",
    contractorId: "",
    requestType: "id_document",
    title: "",
    instructions: "",
    dueAt: "",
  });

  const visibleRequests = useMemo(() => requests, [requests]);

  async function loadRequests() {
    if (!accountId) return;
    setLoading(true);
    setError("");
    try {
      const [requestRows, contractorRows] = await Promise.all([
        fetchDocumentRequests({ accountId }),
        canManage ? fetchContractorsForDocumentRequests(accountId) : Promise.resolve([]),
      ]);
      setRequests(requestRows);
      setContractors(contractorRows);
    } catch (err) {
      setError(err?.message || t("documents.requests.loadError"));
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, canManage]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleCreateRequest(event) {
    event.preventDefault();
    if (!canManage) return;
    setBusy("create");
    setError("");
    try {
      await createDocumentRequest({
        accountId,
        targetRole: form.targetRole,
        tenantId: form.targetRole === "tenant" ? form.tenantId : null,
        contractorId: form.targetRole === "contractor" ? form.contractorId : null,
        requestType: form.requestType,
        title: form.title,
        instructions: form.instructions,
        dueAt: form.dueAt || null,
      });
      setForm((current) => ({ ...current, title: "", instructions: "", dueAt: "" }));
      await loadRequests();
    } catch (err) {
      setError(err?.message || t("documents.requests.createError"));
    } finally {
      setBusy("");
    }
  }

  async function handleUpload(request, event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setBusy(request.id);
    setError("");
    try {
      await uploadDocumentRequestFile({ requestId: request.id, file });
      await loadRequests();
    } catch (err) {
      setError(err?.message || t("documents.requests.uploadError"));
    } finally {
      setBusy("");
      event.target.value = "";
    }
  }

  async function handleReview(uploadId, reviewStatus) {
    setBusy(uploadId);
    setError("");
    try {
      await reviewDocumentRequestUpload({ uploadId, reviewStatus });
      await loadRequests();
    } catch (err) {
      setError(err?.message || t("documents.requests.reviewError"));
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="p-4 space-y-4" data-testid="document-requests-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            {t("documents.requests.eyebrow")}
          </p>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
            {t("documents.requests.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {canManage ? t("documents.requests.managerSubtitle") : t(participantSubtitleKey)}
          </p>
        </div>
        <button
          type="button"
          onClick={loadRequests}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          {t("common.refresh")}
        </button>
      </div>

      {canManage ? (
        <form onSubmit={handleCreateRequest} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          <div className="grid gap-3 lg:grid-cols-[130px_minmax(180px,1fr)_minmax(180px,1fr)_minmax(200px,1fr)]">
            <select
              value={form.targetRole}
              onChange={(event) => patchForm({ targetRole: event.target.value, tenantId: "", contractorId: "" })}
              className={fieldClasses()}
              aria-label={t("documents.requests.targetRole")}
            >
              <option value="tenant">{t("documents.requests.target.tenant")}</option>
              <option value="contractor">{t("documents.requests.target.contractor")}</option>
            </select>

            {form.targetRole === "tenant" ? (
              <select
                value={form.tenantId}
                onChange={(event) => patchForm({ tenantId: event.target.value })}
                className={fieldClasses()}
                aria-label={t("documents.requests.targetTenant")}
                required
              >
                <option value="">{t("documents.selectTenant")}</option>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>{tenant.name || tenant.email}</option>
                ))}
              </select>
            ) : (
              <select
                value={form.contractorId}
                onChange={(event) => patchForm({ contractorId: event.target.value })}
                className={fieldClasses()}
                aria-label={t("documents.requests.targetContractor")}
                required
              >
                <option value="">{t("documents.requests.selectContractor")}</option>
                {contractors.map((contractor) => (
                  <option key={contractor.id} value={contractor.id}>{contractor.name || contractor.email}</option>
                ))}
              </select>
            )}

            <select
              value={form.requestType}
              onChange={(event) => patchForm({ requestType: event.target.value })}
              className={fieldClasses()}
              aria-label={t("documents.requests.type")}
            >
              {REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>{t(`documents.requests.type.${type}`)}</option>
              ))}
            </select>

            <input
              value={form.title}
              onChange={(event) => patchForm({ title: event.target.value })}
              className={fieldClasses()}
              placeholder={t("documents.requests.titlePlaceholder")}
              required
            />
          </div>

          <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_170px_auto]">
            <input
              value={form.instructions}
              onChange={(event) => patchForm({ instructions: event.target.value })}
              className={fieldClasses()}
              placeholder={t("documents.requests.instructionsPlaceholder")}
            />
            <input
              value={form.dueAt}
              onChange={(event) => patchForm({ dueAt: event.target.value })}
              type="date"
              className={fieldClasses()}
              aria-label={t("documents.requests.dueAt")}
            />
            <button
              type="submit"
              disabled={busy === "create"}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
            >
              {busy === "create" ? t("common.saving") : t("documents.requests.create")}
            </button>
          </div>
        </form>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : visibleRequests.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {canManage ? t("documents.requests.emptyManager") : t(emptyParticipantKey)}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {visibleRequests.map((request) => (
            <div
              key={request.id}
              className="p-4"
              data-testid="document-request-card"
              data-request-title={request.title}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-950 dark:text-slate-50">{request.title}</p>
                    <span className={`rounded border px-2 py-0.5 text-xs ${requestStatusClass(request.status)}`}>
                      {t(`documents.requests.status.${request.status}`)}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {t(`documents.requests.type.${request.request_type}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {request.instructions || t("documents.requests.noInstructions")}
                  </p>
                  {canManage ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {request.target_role === "tenant"
                        ? `${t("documents.requests.target.tenant")}: ${request.tenant?.name || request.tenant?.email || "—"}`
                        : `${t("documents.requests.target.contractor")}: ${request.contractor?.name || request.contractor?.email || "—"}`}
                    </p>
                  ) : null}
                </div>

                {!canManage && !["accepted", "cancelled"].includes(request.status) ? (
                  <div>
                    <button
                      type="button"
                      onClick={() => fileInputsRef.current[request.id]?.click()}
                      disabled={busy === request.id}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:bg-slate-400"
                    >
                      {busy === request.id ? t("attachments.uploading") : t("documents.requests.upload")}
                    </button>
                    <input
                      ref={(node) => {
                        if (node) fileInputsRef.current[request.id] = node;
                      }}
                      type="file"
                      className="hidden"
                      accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                      onChange={(event) => handleUpload(request, event)}
                    />
                  </div>
                ) : null}
              </div>

              {request.uploads.length > 0 ? (
                <div className="mt-3 space-y-2">
                  {request.uploads.map((upload) => (
                    <div
                      key={upload.id}
                      className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 text-sm dark:border-slate-800 dark:bg-slate-950 lg:flex-row lg:items-center lg:justify-between"
                    >
                      <div>
                        <p className="font-medium text-slate-900 dark:text-slate-100">{upload.file_name}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {upload.mime_type || "document"} • {(upload.size_bytes / 1024).toFixed(1)} KB • {t(`documents.requests.review.${upload.review_status}`)}
                        </p>
                      </div>
                      {canManage && upload.review_status === "pending_review" ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleReview(upload.id, "accepted")}
                            disabled={busy === upload.id}
                            className="rounded-md border border-green-300 px-3 py-1.5 text-xs font-medium text-green-700 hover:bg-green-50"
                          >
                            {t("documents.requests.accept")}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleReview(upload.id, "rejected")}
                            disabled={busy === upload.id}
                            className="rounded-md border border-red-300 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
                          >
                            {t("documents.requests.reject")}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
