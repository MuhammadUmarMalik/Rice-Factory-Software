import { useMemo, useState } from "react";
import type { DateRangePreset, DateRangeValue } from "@/utils/dateRanges";
import { formatDateInput, getPresetRange } from "@/utils/dateRanges";

type UseReportDateRangeOptions = {
  preset?: DateRangePreset;
};

export function useReportDateRange(options: UseReportDateRangeOptions = {}) {
  const initialPreset = options.preset ?? "thisMonth";
  const [range, setRange] = useState<DateRangeValue>(() => {
    const initial = getPresetRange(initialPreset);
    return { preset: initialPreset, from: initial.from, to: initial.to };
  });

  const fromDate = useMemo(() => formatDateInput(range.from), [range.from]);
  const toDate = useMemo(() => formatDateInput(range.to), [range.to]);
  const isReady = Boolean(range.from && range.to);

  return { range, setRange, fromDate, toDate, isReady };
}
