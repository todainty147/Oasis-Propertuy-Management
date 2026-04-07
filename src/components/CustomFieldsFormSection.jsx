function normalizeFieldType(fieldType) {
  return String(fieldType || "").trim().toLowerCase();
}

export function getCustomFieldInputType(fieldType) {
  const normalized = normalizeFieldType(fieldType);
  if (normalized === "number") return "number";
  if (normalized === "date") return "date";
  return "text";
}

function getFieldValue(values, definitionId) {
  const rawValue = values?.[definitionId];
  if (rawValue === null || rawValue === undefined) return "";
  return String(rawValue);
}

export default function CustomFieldsFormSection({
  definitions = [],
  values = {},
  errors = {},
  onChange,
  disabled = false,
  title = "Custom fields",
  emptyMessage = "No custom fields configured.",
}) {
  if (!Array.isArray(definitions) || definitions.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        {definitions.map((definition) => {
          const definitionId = String(definition?.id || "");
          const fieldType = normalizeFieldType(definition?.fieldType ?? definition?.field_type);
          const inputType = getCustomFieldInputType(fieldType);
          const label = String(definition?.name || "Custom field");
          const errorMessage = String(errors?.[definitionId] || "");

          return (
            <label key={definitionId || label} className="block space-y-1">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-200">{label}</span>
              <input
                type={inputType}
                value={getFieldValue(values, definitionId)}
                disabled={disabled}
                onChange={(event) => onChange?.(definition, event.target.value)}
                aria-invalid={errorMessage ? "true" : "false"}
                className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900 dark:bg-slate-950 dark:text-slate-100 ${
                  errorMessage
                    ? "border-rose-400 focus:border-rose-500 dark:border-rose-700"
                    : "border-slate-200 dark:border-slate-700"
                }`}
              />
              {errorMessage ? (
                <span className="text-xs text-rose-600 dark:text-rose-300">{errorMessage}</span>
              ) : null}
            </label>
          );
        })}
      </div>
    </div>
  );
}
