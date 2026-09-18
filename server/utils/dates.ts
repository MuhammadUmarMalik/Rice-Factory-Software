/**
 * Date boundary helpers shared by the domain models and services.
 *
 * These were module-level functions in the old storage.ts; several models
 * need them, so they live here rather than being duplicated or re-exported
 * from one model.
 */
export function endOfDay(d: Date): Date {
  const dt = new Date(d);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function endOfMonth(d: Date): Date {
  const dt = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

export function toYearMonth(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parsePayrollMonth(value: string): { year: number; month: number } {
  const m = /^(\d{4})-(\d{2})$/.exec(value);
  if (!m) throw new Error("payrollMonth must be YYYY-MM");
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  if (month < 1 || month > 12) throw new Error("payrollMonth must be YYYY-MM");
  return { year, month };
}

export function startOfPayrollMonth(month: string): Date {
  const { year, month: mm } = parsePayrollMonth(month);
  return new Date(year, mm - 1, 1);
}

/** Monday-start week, matching how the period reports group by week. */
export function startOfWeek(d: Date): Date {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = (day + 6) % 7; // Monday start
  dt.setDate(dt.getDate() - diff);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function endOfWeek(d: Date): Date {
  const dt = startOfWeek(d);
  dt.setDate(dt.getDate() + 6);
  dt.setHours(23, 59, 59, 999);
  return dt;
}

/**
 * Local calendar date as YYYY-MM-DD. `toISOString().slice(0,10)` cannot be used
 * for this: period starts are local midnight, which in any positive UTC offset
 * (PKT is +05:00) serialises as 19:00 on the *previous* day, so day-grouped
 * period labels came out one day early.
 */
export function localDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function weekNumber(d: Date): number {
  const yearStart = startOfWeek(new Date(d.getFullYear(), 0, 1));
  const target = startOfWeek(d);
  const diffMs = target.getTime() - yearStart.getTime();
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  return Math.floor(diffDays / 7) + 1;
}
