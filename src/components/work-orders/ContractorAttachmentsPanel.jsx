import { useEffect, useMemo, useState } from "react";
import Card from "../Card";
import Skeleton from "../ui/Skeleton";
import {
  listWorkOrderAttachments,
  uploadWorkOrderAttachments,
  createAttachmentSignedUrlForRow,
  deleteWorkOrderAttachment,
} from "../../services/workOrderAttachmentsService";
import { useI18n } from "../../context/I18nContext";

function isImage(name = "") {
  return /\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(name);
}

function prettySize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ContractorAttachmentsPanel({ accountId, workOrderId, canUpload = false }) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyPath, setBusyPath] = useState("");
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  async function load() {
    if (!accountId || !workOrderId) return;
    setLoading(true);
    setError("");

    try {
      const rows = await listWorkOrderAttachments({ accountId, workOrderId });
      setItems(rows ?? []);
    } catch (e) {
      setError(e?.message || t("attachments.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [accountId, workOrderId]);

  async function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    setUploading(true);
    setError("");

    try {
      await uploadWorkOrderAttachments({
        accountId,
        workOrderId,
        files,
        attesterRole: "contractor",
        maintenanceStage: "contractor_completion",
        captureMethod: "uploaded",
      });
      await load();
      e.target.value = "";
    } catch (e2) {
      setError(e2?.message || t("attachments.uploadError"));
    } finally {
      setUploading(false);
    }
  }

  async function onPreview(item) {
    try {
      setBusyPath(item.storage_path);
      const signedUrl = await createAttachmentSignedUrlForRow({
        attachmentRow: item,
        accountId,
        workOrderId,
      });
      setPreviewUrl(signedUrl);
    } catch (e) {
      setError(e?.message || t("attachments.previewError"));
    } finally {
      setBusyPath("");
    }
  }

  async function onDownload(item) {
    try {
      setBusyPath(item.storage_path);
      const signedUrl = await createAttachmentSignedUrlForRow({
        attachmentRow: item,
        accountId,
        workOrderId,
      });
      window.open(signedUrl, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError(e?.message || t("attachments.downloadError"));
    } finally {
      setBusyPath("");
    }
  }

  async function onDelete(item) {
    const ok = window.confirm(t("attachments.confirmDelete", { name: item.file_name }));
    if (!ok) return;

    try {
      setBusyPath(item.storage_path);
      await deleteWorkOrderAttachment({ attachmentRow: item });
      await load();
    } catch (e) {
      setError(e?.message || t("attachments.deleteError"));
    } finally {
      setBusyPath("");
    }
  }

  const hasItems = useMemo(() => items.length > 0, [items]);

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{t("attachments.workOrderTitle")}</h3>
          <p className="text-sm text-slate-500">{t("attachments.workOrderSubtitle")}</p>
        </div>

        {canUpload && (
          <label className="inline-flex items-center px-3 py-2 rounded-lg bg-slate-900 text-white text-sm cursor-pointer hover:bg-slate-800 disabled:opacity-50">
            {uploading ? t("attachments.uploading") : "Upload completion photo"}
            <input type="file" multiple className="hidden" onChange={onFilesSelected} disabled={uploading} />
          </label>
        )}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : !hasItems ? (
        <div className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          {t("attachments.emptyWorkOrder")}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const image = isImage(item.file_name);
            const rowBusy = busyPath === item.storage_path;

            return (
              <div
                key={item.id || item.storage_path}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{item.file_name}</p>
                  <p className="text-xs text-slate-500">
                    {prettySize(item.file_size)}
                    {item.received_at || item.created_at ? ` • Received ${new Date(item.received_at || item.created_at).toLocaleString()}` : ""}
                  </p>
                  {item.maintenance_stage ? (
                    <p className="mt-1 text-[11px] text-slate-500">
                      Uploaded by {item.attester_role || "user"} • stage {item.maintenance_stage}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {image && (
                    <button
                      type="button"
                      onClick={() => onPreview(item)}
                      disabled={rowBusy}
                      className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
                    >
                      {t("attachments.preview")}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => onDownload(item)}
                    disabled={rowBusy}
                    className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
                  >
                    {t("attachments.download")}
                  </button>

                  {canUpload && (
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      disabled={rowBusy}
                      className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                    >
                      {t("attachments.delete")}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewUrl ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-slate-700">{t("attachments.preview")}</p>
            <button
              type="button"
              onClick={() => setPreviewUrl("")}
              className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
            >
              {t("common.close")}
            </button>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-2">
            <img
              src={previewUrl}
              alt={t("attachments.previewAlt")}
              className="max-h-[420px] w-full object-contain rounded-lg"
            />
          </div>
        </div>
      ) : null}
    </Card>
  );
}
