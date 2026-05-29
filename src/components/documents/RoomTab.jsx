export default function RoomTab({ room, active = false, onClick }) {
  const items = room.inspection_evidence_items || [];
  const ratedCount = items.filter((item) => Boolean(item.condition_rating)).length;
  const complete = items.length > 0 && ratedCount === items.length;
  const partial = ratedCount > 0 && !complete;
  const pipClass = complete
    ? "bg-emerald-400"
    : partial
      ? "bg-amber-400"
      : "bg-slate-500";

  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-t-xl border px-3 py-2 text-left text-sm font-semibold transition ${
        active
          ? "border-slate-700 border-b-slate-950 bg-slate-950 text-slate-50"
          : "border-transparent text-slate-400 hover:bg-slate-900 hover:text-slate-100"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${pipClass}`} aria-hidden="true" />
      <span>{room.room_name}</span>
      <span className="rounded-full bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
        {ratedCount}/{items.length}
      </span>
    </button>
  );
}
