import { useEffect, useMemo, useState } from "react";
import Card from "../Card";
import Skeleton from "../ui/Skeleton";
import {
  listMaintenanceRequestAttachments,
  uploadMaintenanceRequestAttachments,
  createMaintenanceRequestAttachmentSignedUrl,
  deleteMaintenanceRequestAttachment,
} from "../../services/maintenanceRequestAttachmentsService";
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

export default function MaintenanceRequestAttachmentsPanel({
  accountId,
  maintenanceRequestId,
  canUpload = false,
  allowDelete = false,
  requestStatus = "",
}) {
  const { t } = useI18n();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [busyPath, setBusyPath] = useState("");
  const [error, setError] = useState("");
  const [previewUrl, setPreviewUrl] = useState("");

  async function load() {
    if (!accountId || !maintenanceRequestId) return;
    setLoading(true);
    setError("");
    try {
      const rows = await listMaintenanceRequestAttachments({
        accountId,
        maintenanceRequestId,
      });
      setItems(rows || []);
    } catch (e) {
      setError(e?.message || t("attachments.loadError"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [accountId, maintenanceRequestId]);

  async function onFilesSelected(e) {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      await uploadMaintenanceRequestAttachments({
        accountId,
        maintenanceRequestId,
        files,
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
      const signed = await createMaintenanceRequestAttachmentSignedUrl({
        path: item.storage_path,
      });
      setPreviewUrl(signed);
    } catch (e) {
      setError(e?.message || t("attachments.previewError"));
    } finally {
      setBusyPath("");
    }
  }

  async function onDownload(item) {
    try {
      setBusyPath(item.storage_path);
      const signed = await createMaintenanceRequestAttachmentSignedUrl({
        path: item.storage_path,
      });
      window.open(signed, "_blank", "noopener,noreferrer");
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
      await deleteMaintenanceRequestAttachment({ path: item.storage_path });
      await load();
    } catch (e) {
      setError(e?.message || t("attachments.deleteError"));
    } finally {
      setBusyPath("");
    }
  }

  const hasItems = useMemo(() => items.length > 0, [items]);
  const isClosed = String(requestStatus || "").toLowerCase() === "closed";
  const uploadDisabled = uploading || isClosed;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{t("attachments.requestTitle")}</h3>
          <p className="text-sm text-slate-500">{t("attachments.requestSubtitle")}</p>
        </div>
        {canUpload ? (
          <label
            className={`inline-flex items-center px-3 py-2 rounded-lg text-white text-sm ${
              uploadDisabled ? "bg-slate-400 cursor-not-allowed" : "bg-slate-900 cursor-pointer hover:bg-slate-800"
            }`}
            title={isClosed ? t("attachments.closedUploadBlocked") : ""}
          >
            {uploading ? t("attachments.uploading") : t("attachments.addFiles")}
            <input
              type="file"
              multiple
              className="hidden"
              onChange={onFilesSelected}
              disabled={uploadDisabled}
            />
          </label>
        ) : null}
      </div>

      {canUpload && isClosed ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {t("attachments.closedNotice")}
        </div>
      ) : null}

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
          {t("attachments.emptyRequest")}
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => {
            const rowBusy = busyPath === item.storage_path;
            const image = isImage(item.file_name);

            return (
              <div
                key={item.id || item.storage_path}
                className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">{item.file_name}</p>
                  <p className="text-xs text-slate-500">{prettySize(item.file_size)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {image ? (
                    <button
                      type="button"
                      onClick={() => onPreview(item)}
                      disabled={rowBusy}
                      className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
                    >
                      {t("attachments.preview")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onDownload(item)}
                    disabled={rowBusy}
                    className="px-2 py-1 text-xs rounded border border-slate-300 hover:bg-slate-50"
                  >
                    {t("attachments.download")}
                  </button>
                  {allowDelete && canUpload ? (
                    <button
                      type="button"
                      onClick={() => onDelete(item)}
                      disabled={rowBusy}
                      className="px-2 py-1 text-xs rounded border border-red-300 text-red-700 hover:bg-red-50"
                    >
                      {t("attachments.delete")}
                    </button>
                  ) : null}
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
