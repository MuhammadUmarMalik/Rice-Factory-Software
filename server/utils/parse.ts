export function parseRequiredDate(value: unknown, label: string): Date {
  if (!value || typeof value !== "string") throw new Error(`${label} is required`);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) throw new Error(`${label} is invalid`);
  return d;
}

export function parseOptionalDate(value: unknown): Date | undefined {
  if (!value || typeof value !== "string") return undefined;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return undefined;
  return d;
}

export function parseOptionalInt(value: unknown): number | undefined {
  if (value == undefined || value == null || value == "") return undefined;
  const n = typeof value == "string" ? parseInt(value, 10) : Number(value);
  return Number.isFinite(n) ? n : undefined;
}
