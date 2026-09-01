export function formatMoney(value?: string | number, prefix = "Rs.") {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  if (!Number.isFinite(num)) return `${prefix} 0`;
  return `${prefix} ${num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatNumber(value?: string | number) {
  const num = typeof value === "number" ? value : parseFloat(String(value ?? "0"));
  if (!Number.isFinite(num)) return "0";
  return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(value?: string | number | Date) {
  if (!value) return "";
  try {
    const d = new Date(value);
    return d.toISOString().slice(0, 10);
  } catch {
    return "";
  }
}

