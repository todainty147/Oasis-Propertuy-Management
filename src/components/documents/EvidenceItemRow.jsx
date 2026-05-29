import { ChevronDown, ChevronUp, Paperclip, Save, Upload } from "lucide-react";

import { CONDITION_RATINGS, getConditionRatingLabel } from "../../lib/evidenceVault";

function conditionDotClass(value) {
  if (["excellent", "good"].includes(value)) return "bg-emerald-400";
  if (value === "fair" || value === "needs_review") return "bg-amber-400";
  if (["poor", "damaged"].includes(value)) return "bg-rose-400";
  return "bg-slate-500";
}

export default function EvidenceItemRow({
  item,
  locked = false,
  expanded = false,
  onToggleExpanded,
  onConditionChange,
  onSaveNotes,
  onUploadFile,
  onAttachDocument,
  documents = [],
  uploading = false,
  saving = false,
  saved = false,
  renderPhoto,
}) {
  const photos = item.inspection_photos || [];

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/80">
      <div className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_150px_86px_92px] sm:items-center">
        <div className="flex min-w-0 items-center gap-3">
          <span className={`h-3 w-3 shrink-0 rounded-full ${conditionDotClass(item.condition_rating)}`} />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-100">{item.item_label}</p>
            <p className="text-xs text-slate-500">{getConditionRatingLabel(item.condition_rating)}</p>
          </div>
        </div>
        <select
          disabled={locked}
          value={item.condition_rating || ""}
          onChange={(event) => onConditionChange(item, event.target.value || null)}
          className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-60"
        >
          <option value="">Not rated</option>
          {CONDITION_RATINGS.map((condition) => (
            <option key={condition.value} value={condition.value}>
              {condition.label}
            </option>
          ))}
        </select>
        <span
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200"
          aria-label={`${photos.length} linked files`}
        >
          <Paperclip size={14} /> {photos.length}
        </span>
        <button
          type="button"
          onClick={onToggleExpanded}
          className="inline-flex items-center justify-center gap-1 rounded-lg border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-900"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          {expanded ? "Less" : "More"}
        </button>
      </div>

      {expanded ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSaveNotes(item, event.currentTarget.elements.notes.value);
          }}
          className="border-t border-slate-800 p-3"
        >
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_132px]">
            <textarea
              name="notes"
              disabled={locked}
              defaultValue={item.notes || ""}
              placeholder="Condition notes"
              className="min-h-16 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={locked || saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-60"
            >
              <Save size={14} /> {saving ? "Saving..." : saved ? "Saved" : "Save"}
            </button>
          </div>

          <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-900">
              <Upload size={14} />
              {uploading ? "Uploading..." : "Upload photo/file"}
              <input
                type="file"
                accept="image/*,.pdf,.doc,.docx"
                capture="environment"
                disabled={locked || uploading}
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  onUploadFile(item, file);
                }}
              />
            </label>
            <label className="inline-flex min-w-0 items-center gap-2">
              <Paperclip size={14} className="shrink-0 text-slate-500" />
              <select
                disabled={locked || uploading}
                value=""
                onChange={(event) => onAttachDocument(item, event.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 disabled:opacity-60"
              >
                <option value="">Attach existing document</option>
                {documents.map((document) => (
                  <option key={document.id} value={document.id}>
                    {document.name || document.original_filename || document.id}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {photos.length > 0 ? (
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((photo) => renderPhoto(photo))}
            </div>
          ) : (
            <p className="mt-3 text-xs text-slate-500">No photos added yet. Add photos from your phone during the walkthrough.</p>
          )}
        </form>
      ) : null}
    </div>
  );
}
