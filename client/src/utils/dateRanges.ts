import {
  endOfMonth,
  endOfWeek,
  format,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";

export type DateRangePreset =
  | "all"
  | "today"
  | "yesterday"
  | "thisWeek"
  | "lastWeek"
  | "thisMonth"
  | "lastMonth"
  | "custom";

export type DateRangeValue = {
  preset: DateRangePreset;
  from: Date | null;
  to: Date | null;
};

const WEEK_STARTS_ON = 1;

export function formatDateInput(value?: Date | null) {
  if (!value) return "";
  return format(value, "yyyy-MM-dd");
}

export function parseDateInput(value?: string) {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export function getPresetRange(preset: DateRangePreset, baseDate: Date = new Date()) {
  if (preset === "all") {
    return { from: null, to: null };
  }
  const today = startOfDay(baseDate);
  switch (preset) {
    case "yesterday": {
      const day = subDays(today, 1);
      return { from: day, to: day };
    }
    case "thisWeek": {
      return { from: startOfWeek(today, { weekStartsOn: WEEK_STARTS_ON }), to: today };
    }
    case "lastWeek": {
      const lastWeek = subWeeks(today, 1);
      return {
        from: startOfWeek(lastWeek, { weekStartsOn: WEEK_STARTS_ON }),
        to: endOfWeek(lastWeek, { weekStartsOn: WEEK_STARTS_ON }),
      };
    }
    case "thisMonth": {
      return { from: startOfMonth(today), to: today };
    }
    case "lastMonth": {
      const lastMonth = subMonths(today, 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }
    case "today":
    case "custom":
    default: {
      return { from: today, to: today };
    }
  }
}
