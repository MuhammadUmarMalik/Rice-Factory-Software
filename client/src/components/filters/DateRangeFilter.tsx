import { useEffect, useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import type { DateRangePreset, DateRangeValue } from "@/utils/dateRanges";
import { formatDateInput, getPresetRange, parseDateInput } from "@/utils/dateRanges";

type DateRangeFilterProps = {
  value: DateRangeValue;
  onChange: (next: DateRangeValue) => void;
  className?: string;
  debounceMs?: number;
};

const presets: Array<{ key: DateRangePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "thisWeek", label: "This Week" },
  { key: "lastWeek", label: "Last Week" },
  { key: "thisMonth", label: "This Month" },
  { key: "lastMonth", label: "Last Month" },
  { key: "custom", label: "Custom" },
];

export function DateRangeFilter({
  value,
  onChange,
  className,
  debounceMs = 300,
}: DateRangeFilterProps) {
  const id = useId();
  const [fromInput, setFromInput] = useState(() => formatDateInput(value.from));
  const [toInput, setToInput] = useState(() => formatDateInput(value.to));
  const currentFrom = useMemo(() => formatDateInput(value.from), [value.from]);
  const currentTo = useMemo(() => formatDateInput(value.to), [value.to]);

  useEffect(() => {
    setFromInput(currentFrom);
    setToInput(currentTo);
  }, [currentFrom, currentTo]);

  const handlePresetSelect = (preset: DateRangePreset) => {
    if (preset === value.preset) return;
    if (preset === "custom") {
      onChange({ ...value, preset: "custom" });
      return;
    }
    const next = getPresetRange(preset);
    onChange({ preset, from: next.from, to: next.to });
  };

  useEffect(() => {
    if (value.preset !== "custom") return;
    const nextFrom = parseDateInput(fromInput);
    const nextTo = parseDateInput(toInput);
    if (formatDateInput(nextFrom) === currentFrom && formatDateInput(nextTo) === currentTo) return;
    const handle = window.setTimeout(() => {
      onChange({ preset: "custom", from: nextFrom, to: nextTo });
    }, debounceMs);
    return () => window.clearTimeout(handle);
  }, [fromInput, toInput, value.preset, currentFrom, currentTo, onChange, debounceMs]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Date range presets">
        {presets.map((preset) => (
          <Button
            key={preset.key}
            type="button"
            size="sm"
            variant={value.preset === preset.key ? "default" : "outline"}
            aria-pressed={value.preset === preset.key}
            onClick={() => handlePresetSelect(preset.key)}
          >
            {preset.label}
          </Button>
        ))}
      </div>
      {value.preset === "custom" && (
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label htmlFor={`${id}-from`}>From</Label>
            <Input
              id={`${id}-from`}
              type="date"
              value={fromInput}
              onChange={(event) => setFromInput(event.target.value)}
            />
          </div>
          <div>
            <Label htmlFor={`${id}-to`}>To</Label>
            <Input
              id={`${id}-to`}
              type="date"
              value={toInput}
              onChange={(event) => setToInput(event.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
