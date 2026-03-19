function escapeCsvValue(value) {
  const normalized =
    value === null || value === undefined
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  if (/["\n,]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }

  return normalized;
}

export function buildCsv(rows = [], columns = []) {
  const header = columns.map((column) => escapeCsvValue(column.header)).join(",");
  const body = rows.map((row) => columns.map((column) => escapeCsvValue(column.getValue(row))).join(","));
  return [header, ...body].join("\n");
}

export function downloadTextFile(filename, content, mimeType = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
