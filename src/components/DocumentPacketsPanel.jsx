import { useEffect, useMemo, useState } from "react";
import Card from "./Card";
import {
  completeDocumentPacket,
  createDocumentPacket,
  fetchDocumentPackets,
  markDocumentPacketViewed,
  requestDocumentPacketSignature,
  sendDocumentPacket,
  voidDocumentPacket,
} from "../services/documentPacketService";
import { prepareDocumentPacketSignature } from "../services/documentSignatureService";
import { fetchContractorsForDocumentRequests } from "../services/documentRequestService";
import { fetchDocumentTemplates } from "../services/documentTemplateService";

const PACKET_TYPES = ["agreement", "contractor_terms", "maintenance_consent", "other"];

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function isManagerRole(role) {
  return ["owner", "admin", "staff", "root", "super-admin", "super_admin"].includes(normalizeRole(role));
}

function fieldClasses(extra = "") {
  return `rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 ${extra}`;
}

function statusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-900";
  if (s === "voided") return "bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700";
  if (s === "viewed") return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900";
  if (s === "sent") return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900";
  return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700";
}

function signatureStatusClass(status) {
  const s = String(status || "").toLowerCase();
  if (s === "completed") return "bg-green-50 text-green-700 border-green-200 dark:bg-green-950/40 dark:text-green-200 dark:border-green-900";
  if (s === "pending" || s === "requested") return "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-200 dark:border-blue-900";
  if (s === "failed") return "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-200 dark:border-red-900";
  if (s === "cancelled") return "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900";
  if (s === "ready") return "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-900";
  return "bg-slate-50 text-slate-700 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700";
}

function eventLabel(event, t) {
  return t(`documents.packets.event.${event.event_type}`, { defaultValue: event.event_type });
}

export default function DocumentPacketsPanel({
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
    ? "documents.packets.participantSubtitleContractor"
    : "documents.packets.participantSubtitle";
  const emptyParticipantKey = normalizedRole === "contractor"
    ? "documents.packets.emptyParticipantContractor"
    : "documents.packets.emptyParticipant";
  const [packets, setPackets] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [contractors, setContractors] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({
    templateId: "",
    targetRole: "tenant",
    tenantId: "",
    contractorId: "",
    packetType: "agreement",
    title: "",
    message: "",
  });

  const activeTemplates = useMemo(
    () => templates.filter((template) => template.status === "active" && template.upload_status === "uploaded"),
    [templates],
  );

  async function load() {
    if (!accountId) return;
    setLoading(true);
    setError("");
    try {
      const [packetRows, templateRows, contractorRows] = await Promise.all([
        fetchDocumentPackets({ accountId }),
        canManage ? fetchDocumentTemplates({ accountId, status: "active" }) : Promise.resolve([]),
        canManage ? fetchContractorsForDocumentRequests(accountId) : Promise.resolve([]),
      ]);
      setPackets(packetRows);
      setTemplates(templateRows);
      setContractors(contractorRows);
      setForm((current) => ({
        ...current,
        templateId: current.templateId || templateRows.find((template) => template.status === "active")?.id || "",
      }));
    } catch (err) {
      setError(err?.message || t("documents.packets.loadError"));
      setPackets([]);
      setTemplates([]);
      setContractors([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountId, canManage]);

  function patchForm(patch) {
    setForm((current) => ({ ...current, ...patch }));
  }

  async function handleCreate(event) {
    event.preventDefault();
    if (!canManage) return;
    setBusy("create");
    setError("");
    try {
      await createDocumentPacket({
        accountId,
        templateId: form.templateId,
        targetRole: form.targetRole,
        tenantId: form.targetRole === "tenant" ? form.tenantId : null,
        contractorId: form.targetRole === "contractor" ? form.contractorId : null,
        packetType: form.packetType,
        title: form.title,
        message: form.message,
      });
      setForm((current) => ({ ...current, title: "", message: "" }));
      await load();
    } catch (err) {
      setError(err?.message || t("documents.packets.createError"));
    } finally {
      setBusy("");
    }
  }

  async function runAction(packetId, action, fallbackKey) {
    setBusy(`${action.name}:${packetId}`);
    setError("");
    try {
      await action({ packetId });
      await load();
    } catch (err) {
      setError(err?.message || t(fallbackKey));
    } finally {
      setBusy("");
    }
  }

  async function handleParticipantOpen(packet) {
    if (packet.status === "sent") {
      await runAction(packet.id, markDocumentPacketViewed, "documents.packets.viewError");
    }
  }

  async function handlePrepareSignature(packetId) {
    setBusy(`prepare-signature:${packetId}`);
    setError("");
    try {
      await prepareDocumentPacketSignature({ packetId });
      await load();
    } catch (err) {
      setError(err?.message || t("documents.packets.prepareSignatureError"));
    } finally {
      setBusy("");
    }
  }

  async function handleSendForSignature(packetId) {
    setBusy(`send-signature:${packetId}`);
    setError("");
    try {
      await requestDocumentPacketSignature({ packetId });
      await load();
    } catch (err) {
      setError(err?.message || t("documents.packets.signatureRequestError"));
    } finally {
      setBusy("");
    }
  }

  return (
    <Card className="p-4 space-y-4" data-testid="document-packets-panel">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600 dark:text-blue-300">
            {t("documents.packets.eyebrow")}
          </p>
          <h2 className="text-lg font-semibold text-slate-950 dark:text-slate-50">
            {t("documents.packets.title")}
          </h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {canManage ? t("documents.packets.managerSubtitle") : t(participantSubtitleKey)}
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-900"
        >
          {t("common.refresh")}
        </button>
      </div>

      {canManage ? (
        <form onSubmit={handleCreate} className="rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950/60">
          {activeTemplates.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
              {t("documents.packets.noTemplates")}
            </p>
          ) : (
            <>
              <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_130px_minmax(180px,1fr)_minmax(180px,1fr)]">
                <select
                  value={form.templateId}
                  onChange={(event) => patchForm({ templateId: event.target.value })}
                  className={fieldClasses()}
                  aria-label={t("documents.packets.template")}
                  required
                >
                  {activeTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>

                <select
                  value={form.targetRole}
                  onChange={(event) => patchForm({ targetRole: event.target.value, tenantId: "", contractorId: "" })}
                  className={fieldClasses()}
                  aria-label={t("documents.packets.targetRole")}
                >
                  <option value="tenant">{t("documents.requests.target.tenant")}</option>
                  <option value="contractor">{t("documents.requests.target.contractor")}</option>
                </select>

                {form.targetRole === "tenant" ? (
                  <select
                    value={form.tenantId}
                    onChange={(event) => patchForm({ tenantId: event.target.value })}
                    className={fieldClasses()}
                    aria-label={t("documents.packets.targetTenant")}
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
                    aria-label={t("documents.packets.targetContractor")}
                    required
                  >
                    <option value="">{t("documents.requests.selectContractor")}</option>
                    {contractors.map((contractor) => (
                      <option key={contractor.id} value={contractor.id}>{contractor.name || contractor.email}</option>
                    ))}
                  </select>
                )}

                <select
                  value={form.packetType}
                  onChange={(event) => patchForm({ packetType: event.target.value })}
                  className={fieldClasses()}
                  aria-label={t("documents.packets.type")}
                >
                  {PACKET_TYPES.map((type) => (
                    <option key={type} value={type}>{t(`documents.packets.type.${type}`)}</option>
                  ))}
                </select>
              </div>

              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_auto]">
                <input
                  value={form.title}
                  onChange={(event) => patchForm({ title: event.target.value })}
                  className={fieldClasses()}
                  placeholder={t("documents.packets.titlePlaceholder")}
                  required
                />
                <input
                  value={form.message}
                  onChange={(event) => patchForm({ message: event.target.value })}
                  className={fieldClasses()}
                  placeholder={t("documents.packets.messagePlaceholder")}
                />
                <button
                  type="submit"
                  disabled={busy === "create"}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {busy === "create" ? t("common.saving") : t("documents.packets.create")}
                </button>
              </div>
            </>
          )}
        </form>
      ) : null}

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200">
          {error}
        </p>
      ) : null}

      {loading ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("common.loading")}</p>
      ) : packets.length === 0 ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
          {canManage ? t("documents.packets.emptyManager") : t(emptyParticipantKey)}
        </div>
      ) : (
        <div className="divide-y divide-slate-200 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {packets.map((packet) => (
            <div
              key={packet.id}
              className="p-4"
              data-testid="document-packet-card"
              data-packet-id={packet.id}
              data-packet-title={packet.title}
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-slate-950 dark:text-slate-50">{packet.title}</p>
                    <span className={`rounded border px-2 py-0.5 text-xs ${statusClass(packet.status)}`}>
                      {t(`documents.packets.status.${packet.status}`)}
                    </span>
                    <span className={`rounded border px-2 py-0.5 text-xs ${signatureStatusClass(packet.signature_status)}`}>
                      {t(`documents.packets.signatureStatus.${packet.signature_status}`, {
                        defaultValue: packet.signature_status || t("documents.packets.signatureStatus.not_configured"),
                      })}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                      {t(`documents.packets.type.${packet.packet_type}`)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                    {packet.message || t("documents.packets.noMessage")}
                  </p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {t("documents.packets.template")}: {packet.template?.name || "—"}
                  </p>
                  {packet.signature_submitter_url ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {t("documents.packets.signaturePortalReady")}
                    </p>
                  ) : null}
                  {packet.signature_error ? (
                    <p className="mt-1 text-xs text-red-600 dark:text-red-300">
                      {packet.signature_error}
                    </p>
                  ) : null}
                  {canManage ? (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {packet.target_role === "tenant"
                        ? `${t("documents.requests.target.tenant")}: ${packet.tenant?.name || packet.tenant?.email || "—"}`
                        : `${t("documents.requests.target.contractor")}: ${packet.contractor?.name || packet.contractor?.email || "—"}`}
                    </p>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-2">
                  {canManage && packet.status === "draft" ? (
                    <button
                      type="button"
                      onClick={() => runAction(packet.id, sendDocumentPacket, "documents.packets.sendError")}
                      disabled={busy.endsWith(packet.id)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
                    >
                      {t("documents.packets.send")}
                    </button>
                  ) : null}

                  {canManage && !["completed", "voided"].includes(packet.status) ? (
                    <>
                      {["not_configured", "failed", "cancelled"].includes(packet.signature_status) ? (
                        <button
                          type="button"
                          onClick={() => handlePrepareSignature(packet.id)}
                          disabled={busy.endsWith(packet.id)}
                          className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-60 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                        >
                          {t("documents.packets.prepareSignature")}
                        </button>
                      ) : null}

                      {packet.signature_status === "ready" ? (
                        <button
                          type="button"
                          onClick={() => handleSendForSignature(packet.id)}
                          disabled={busy.endsWith(packet.id)}
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
                        >
                          {t("documents.packets.sendForSignature")}
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {canManage && !["completed", "voided"].includes(packet.status) ? (
                    <button
                      type="button"
                      onClick={() => runAction(packet.id, voidDocumentPacket, "documents.packets.voidError")}
                      disabled={busy.endsWith(packet.id)}
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60 dark:border-red-800 dark:text-red-200 dark:hover:bg-red-950/40"
                    >
                      {t("documents.packets.void")}
                    </button>
                  ) : null}

                  {!canManage && ["sent", "viewed"].includes(packet.status) ? (
                    <>
                      {packet.signature_submitter_url ? (
                        <a
                          href={packet.signature_submitter_url}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-200 dark:hover:bg-emerald-950/40"
                        >
                          {t("documents.packets.openSignature")}
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => handleParticipantOpen(packet)}
                        disabled={busy.endsWith(packet.id)}
                        className="rounded-lg border border-blue-300 px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-50 disabled:opacity-60 dark:border-blue-800 dark:text-blue-200 dark:hover:bg-blue-950/40"
                      >
                        {t("documents.packets.markViewed")}
                      </button>
                      {!["ready", "requested", "pending"].includes(packet.signature_status) ? (
                        <button
                          type="button"
                          onClick={() => runAction(packet.id, completeDocumentPacket, "documents.packets.completeError")}
                          disabled={busy.endsWith(packet.id)}
                          className="rounded-lg bg-green-600 px-3 py-2 text-sm font-medium text-white disabled:bg-slate-400"
                        >
                          {t("documents.packets.complete")}
                        </button>
                      ) : null}
                    </>
                  ) : null}
                </div>
              </div>

              {packet.events.length > 0 ? (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-950">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("documents.packets.events")}
                  </p>
                  <div className="mt-2 space-y-1">
                    {packet.events.slice(0, 4).map((event) => (
                      <p key={event.id} className="text-xs text-slate-600 dark:text-slate-300">
                        {eventLabel(event, t)} · {new Date(event.created_at).toLocaleString()}
                      </p>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
