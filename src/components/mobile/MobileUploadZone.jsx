/**
 * MobileUploadZone — mobile-first file upload component.
 *
 * Features:
 *  - Large tappable area (min 52px, full-width on mobile)
 *  - Camera shortcut on mobile devices (capture="environment")
 *  - Upload progress bar
 *  - Retry button on failure
 *  - Friendly error state with guidance
 *  - Success state with file count
 *  - Respects allowedMimeTypes, maxBytes, maxFiles from useMobileUpload preset
 *
 * Usage:
 *   const uploader = useMobileUpload({ uploadFn, preset: UPLOAD_PRESETS.maintenancePhoto, onSuccess });
 *   <MobileUploadZone uploader={uploader} files={selectedFiles} onFilesChange={setSelectedFiles} />
 */
import { useRef } from "react";
import { Camera, Upload, CheckCircle, AlertCircle, RotateCcw, X } from "lucide-react";

export default function MobileUploadZone({
  uploader,
  className = "",
  showCameraShortcut = true,
}) {
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  function handleFileChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length > 0) {
      uploader.upload(files);
    }
    // Reset input so the same file can be selected again after reset
    e.target.value = "";
  }

  // ── Idle ──────────────────────────────────────────────────────────────────

  if (uploader.isIdle || uploader.status === "validating") {
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        {/* Primary upload button — large, full-width on mobile */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center justify-center gap-2 w-full min-h-[52px] px-4 py-3 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-sm hover:border-[#0b4f6c] hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors"
          aria-label={uploader.label}
        >
          <Upload size={18} />
          {uploader.label}
        </button>

        {/* Camera shortcut — mobile only, hidden on desktop */}
        {showCameraShortcut && (
          <button
            type="button"
            onClick={() => cameraInputRef.current?.click()}
            className="lg:hidden flex items-center justify-center gap-2 w-full min-h-[48px] px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-medium text-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            aria-label="Take a photo with camera"
          >
            <Camera size={18} />
            Take a photo
          </button>
        )}

        {uploader.hint && (
          <p className="text-xs text-slate-500 dark:text-slate-400 text-center mt-0.5">
            {uploader.hint}
          </p>
        )}

        {/* Hidden file inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept={uploader.accept}
          multiple
          className="sr-only"
          onChange={handleFileChange}
          aria-hidden="true"
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleFileChange}
          aria-hidden="true"
        />
      </div>
    );
  }

  // ── Uploading ─────────────────────────────────────────────────────────────

  if (uploader.isUploading) {
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        <div className="flex items-center justify-between text-sm font-medium text-slate-700 dark:text-slate-200">
          <span>Uploading…</span>
          <span>{uploader.progress}%</span>
        </div>
        <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-[#0b4f6c] rounded-full transition-all duration-300 ease-out"
            style={{ width: `${uploader.progress}%` }}
            role="progressbar"
            aria-valuenow={uploader.progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Upload progress"
          />
        </div>
        <button
          type="button"
          onClick={uploader.cancel}
          className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-red-500 transition-colors self-center"
        >
          <X size={13} /> Cancel
        </button>
      </div>
    );
  }

  // ── Success ───────────────────────────────────────────────────────────────

  if (uploader.isSuccess) {
    const count = uploader.uploaded?.length ?? 0;
    return (
      <div className={`flex flex-col gap-2 ${className}`}>
        <div className="flex items-center gap-2 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300">
          <CheckCircle size={18} className="flex-shrink-0" />
          <p className="text-sm font-medium">
            {count === 1 ? "1 file uploaded" : `${count} files uploaded`}
          </p>
        </div>
        <button
          type="button"
          onClick={uploader.reset}
          className="flex items-center justify-center gap-1.5 text-sm text-[#0b4f6c] dark:text-[#14b8a6] font-medium hover:underline self-center"
        >
          <RotateCcw size={14} /> Upload more
        </button>
      </div>
    );
  }

  // ── Error ─────────────────────────────────────────────────────────────────

  if (uploader.isError) {
    return (
      <div className={`flex flex-col gap-3 ${className}`}>
        <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300">
          <AlertCircle size={18} className="flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">Upload failed</p>
            {uploader.error && (
              <p className="text-xs mt-0.5 leading-snug">{uploader.error}</p>
            )}
            <p className="text-xs mt-1 text-red-500 dark:text-red-400">
              Check your connection and try again.
            </p>
          </div>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={uploader.reset}
            className="flex-1 flex items-center justify-center gap-2 min-h-[48px] px-4 py-2.5 rounded-xl bg-[#0b4f6c] text-white text-sm font-semibold hover:bg-[#07384d] transition-colors"
          >
            <RotateCcw size={15} /> Try again
          </button>
        </div>

        {/* Camera guidance if on mobile */}
        <p className="text-xs text-slate-500 dark:text-slate-400 text-center">
          If using camera, ensure the app has photo library access in your device settings.
        </p>
      </div>
    );
  }

  return null;
}
