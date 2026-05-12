import { useState } from "react";
import { ChevronDown, ChevronRight, ClipboardList, Plus, Trash2, CheckCircle2 } from "lucide-react";
import { useI18n } from "../../context/I18nContext";
import { saveHandoverProtocol, confirmHandoverProtocol } from "../../services/evidencePackService";
import { deriveHandoverStatus } from "../../utils/evidencePackUtils";

// ── Condition options ────────────────────────────────────────────────────────

const CONDITIONS = ["good", "fair", "poor"];

const CONDITION_STYLES = {
  good: "border-green-300 text-green-700 bg-green-50 dark:border-green-700 dark:text-green-300 dark:bg-green-950/20",
  fair: "border-amber-300 text-amber-700 bg-amber-50 dark:border-amber-700 dark:text-amber-300 dark:bg-amber-950/20",
  poor: "border-red-300 text-red-700 bg-red-50 dark:border-red-700 dark:text-red-300 dark:bg-red-950/20",
};

// ── Room row ─────────────────────────────────────────────────────────────────

function RoomRow({ room, index, onChange, onRemove, t }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={room.room || ""}
          onChange={(e) => onChange(index, { ...room, room: e.target.value })}
          placeholder={t("handover.roomName")}
          className="flex-1 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <div className="flex gap-1">
          {CONDITIONS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onChange(index, { ...room, condition: c })}
              className={`text-xs px-2 py-1 rounded border transition-colors ${
                room.condition === c
                  ? CONDITION_STYLES[c]
                  : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
              }`}
            >
              {t(`handover.condition.${c}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="text-slate-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
        >
          <Trash2 size={14} />
        </button>
      </div>
      <textarea
        value={room.notes || ""}
        onChange={(e) => onChange(index, { ...room, notes: e.target.value })}
        placeholder={t("handover.roomNotes")}
        rows={2}
        className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
      />
    </div>
  );
}

// ── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLES = {
  draft:               "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300",
  landlord_confirmed:  "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300",
  completed:           "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-300",
};

function StatusBadge({ status, t }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_STYLES[status] || STATUS_STYLES.draft}`}>
      {t(`handover.status.${status}`)}
    </span>
  );
}

// ── Existing protocol card ────────────────────────────────────────────────────

function ProtocolCard({ protocol, onEdit, t }) {
  const status = deriveHandoverStatus(protocol);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 flex items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
            {t(`handover.type.${protocol.protocol_type}`)}
          </p>
          <StatusBadge status={status} t={t} />
        </div>
        {protocol.general_condition && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
            {protocol.general_condition}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-400">
          {Array.isArray(protocol.room_notes) ? protocol.room_notes.length : 0} {t("handover.rooms")}
          {protocol.keys_handed_over && ` · ${t("handover.keysHandedOver")}`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onEdit(protocol)}
        className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 shrink-0"
      >
        {t("common.edit")}
      </button>
    </div>
  );
}

// ── Main HandoverProtocolPanel ───────────────────────────────────────────────

export default function HandoverProtocolPanel({
  accountId,
  propertyId,
  tenantId,
  leaseId,
  protocols = [],
  onSaved,
}) {
  const { t } = useI18n();
  const [open,           setOpen]           = useState(false);
  const [editing,        setEditing]        = useState(null);  // null = closed, {} = new, {id,...} = existing
  const [protocolType,   setProtocolType]   = useState("move_in");
  const [generalCond,    setGeneralCond]    = useState("");
  const [roomNotes,      setRoomNotes]      = useState([]);
  const [keysHandedOver, setKeysHandedOver] = useState(false);
  const [appliancesNotes,setAppliancesNotes]= useState("");
  const [additionalNotes,setAdditionalNotes]= useState("");
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState(null);

  function startNew() {
    setEditing({});
    setProtocolType("move_in");
    setGeneralCond("");
    setRoomNotes([]);
    setKeysHandedOver(false);
    setAppliancesNotes("");
    setAdditionalNotes("");
    setError(null);
  }

  function startEdit(protocol) {
    setEditing(protocol);
    setProtocolType(protocol.protocol_type);
    setGeneralCond(protocol.general_condition || "");
    setRoomNotes(Array.isArray(protocol.room_notes) ? protocol.room_notes : []);
    setKeysHandedOver(protocol.keys_handed_over || false);
    setAppliancesNotes(protocol.appliances_notes || "");
    setAdditionalNotes(protocol.additional_notes || "");
    setError(null);
  }

  function addRoom() {
    setRoomNotes((prev) => [...prev, { room: "", condition: "good", notes: "" }]);
  }

  function updateRoom(idx, updated) {
    setRoomNotes((prev) => prev.map((r, i) => (i === idx ? updated : r)));
  }

  function removeRoom(idx) {
    setRoomNotes((prev) => prev.filter((_, i) => i !== idx));
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await saveHandoverProtocol({
        accountId,
        propertyId,
        tenantId,
        leaseId,
        protocolType,
        generalCondition: generalCond || null,
        roomNotes,
        keysHandedOver,
        appliancesNotes:  appliancesNotes || null,
        additionalNotes:  additionalNotes || null,
        protocolId:       editing?.id || null,
      });
      setEditing(null);
      onSaved?.();
    } catch {
      setError(t("handover.saveError"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full px-5 py-4 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <ClipboardList size={16} className="text-slate-400" />
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            {t("handover.title")}
          </p>
          {protocols.length > 0 && (
            <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500">
              {protocols.length}
            </span>
          )}
        </div>
        {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-3 border-t border-slate-100 dark:border-slate-800 pt-4">
          {/* Disclaimer */}
          <p className="text-xs text-slate-500 dark:text-slate-400 italic">
            {t("handover.disclaimer")}
          </p>

          {/* Existing protocols */}
          {protocols.map((p) => (
            <ProtocolCard key={p.id} protocol={p} onEdit={startEdit} t={t} />
          ))}

          {/* Form */}
          {editing !== null && (
            <div className="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/30 dark:bg-blue-950/10 p-4 space-y-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                {editing.id ? t("handover.editTitle") : t("handover.newTitle")}
              </p>

              {/* Protocol type */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("handover.typeLabel")}
                </label>
                <div className="flex gap-2">
                  {["move_in", "move_out"].map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setProtocolType(type)}
                      className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
                        protocolType === type
                          ? "border-blue-400 bg-blue-50 text-blue-700 dark:border-blue-600 dark:bg-blue-950/40 dark:text-blue-300"
                          : "border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {t(`handover.type.${type}`)}
                    </button>
                  ))}
                </div>
              </div>

              {/* General condition */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("handover.generalCondition")}
                </label>
                <textarea
                  value={generalCond}
                  onChange={(e) => setGeneralCond(e.target.value)}
                  rows={2}
                  placeholder={t("handover.generalConditionPlaceholder")}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {/* Room notes */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                    {t("handover.rooms")} ({roomNotes.length})
                  </label>
                  <button
                    type="button"
                    onClick={addRoom}
                    className="text-xs px-2 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 flex items-center gap-1"
                  >
                    <Plus size={11} /> {t("handover.addRoom")}
                  </button>
                </div>
                {roomNotes.map((room, idx) => (
                  <RoomRow
                    key={idx}
                    room={room}
                    index={idx}
                    onChange={updateRoom}
                    onRemove={removeRoom}
                    t={t}
                  />
                ))}
              </div>

              {/* Keys */}
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={keysHandedOver}
                  onChange={(e) => setKeysHandedOver(e.target.checked)}
                  className="rounded border-slate-300 dark:border-slate-600"
                />
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {t("handover.keysHandedOver")}
                </span>
              </label>

              {/* Appliances / additional notes */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t("handover.additionalNotes")}
                </label>
                <textarea
                  value={additionalNotes}
                  onChange={(e) => setAdditionalNotes(e.target.value)}
                  rows={2}
                  placeholder={t("handover.additionalNotesPlaceholder")}
                  className="w-full text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {error && (
                <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="text-sm px-3 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  disabled={saving}
                  onClick={handleSave}
                  className="text-sm px-3 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {saving ? t("common.loading") : t("common.save")}
                </button>
              </div>
            </div>
          )}

          {editing === null && (
            <button
              type="button"
              onClick={startNew}
              className="w-full text-sm px-3 py-2 rounded-lg border border-dashed border-slate-300 text-slate-500 hover:border-blue-400 hover:text-blue-600 dark:border-slate-600 dark:text-slate-400 dark:hover:border-blue-600 dark:hover:text-blue-300 flex items-center justify-center gap-2 transition-colors"
            >
              <Plus size={14} />
              {t("handover.addProtocol")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
