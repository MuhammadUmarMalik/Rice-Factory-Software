type CsvValue = string | number | boolean | null | undefined;

function escapeCsv(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  const raw = String(value);
  if (/[",\n\r]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv<T>(
  filename: string,
  columns: Array<{ header: string; value: (row: T) => CsvValue }>,
  rows: T[],
) {
  const headerLine = columns.map((c) => escapeCsv(c.header)).join(",");
  const dataLines = rows.map((r) => columns.map((c) => escapeCsv(c.value(r))).join(","));
  const csv = [headerLine, ...dataLines].join("\r\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  downloadBlob(filename.endsWith(".csv") ? filename : `${filename}.csv`, blob);
}

