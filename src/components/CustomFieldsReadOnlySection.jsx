import Card from "./Card";

export default function CustomFieldsReadOnlySection({
  title = "Custom fields",
  rows = [],
  loading = false,
  emptyMessage = "No custom fields configured yet.",
}) {
  const hasRows = Array.isArray(rows) && rows.length > 0;

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {loading ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">Loading custom fields...</p>
        ) : null}
        {!loading && !hasRows ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
        ) : null}
        {!loading
          ? rows.map((row) => (
              <div
                key={row.id || row.name}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/40"
              >
                <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {row.name}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                  {row.value || "—"}
                </p>
              </div>
            ))
          : null}
      </div>
    </Card>
  );
}
