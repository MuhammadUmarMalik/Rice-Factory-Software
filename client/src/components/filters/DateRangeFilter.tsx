import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar as CalendarIcon, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { DateRangePreset, DateRangeValue } from "@/utils/dateRanges";
import { formatDateInput, getPresetRange } from "@/utils/dateRanges";

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

const MIN_DATE = new Date(1980, 0, 1);

export function DateRangeFilter({
  value,
  onChange,
  className,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);
  const initialPresetRef = useRef(value.preset);
  const initialRangeRef = useRef<DateRange | undefined>({
    from: value.from ?? undefined,
    to: value.to ?? undefined,
  });
  const [draftRange, setDraftRange] = useState<DateRange | undefined>(() => ({
    from: value.from ?? undefined,
    to: value.to ?? undefined,
  }));
  const currentFrom = useMemo(() => formatDateInput(value.from), [value.from]);
  const currentTo = useMemo(() => formatDateInput(value.to), [value.to]);
  const displayLabel = useMemo(() => {
    if (value.from && value.to) {
      return `${format(value.from, "dd MMM yy")} - ${format(value.to, "dd MMM yy")}`;
    }
    if (value.from) {
      return format(value.from, "dd MMM yy");
    }
    return "Select range";
  }, [value.from, value.to]);

  useEffect(() => {
    setDraftRange({ from: value.from ?? undefined, to: value.to ?? undefined });
  }, [value.from, value.to]);

  const handlePresetSelect = (preset: DateRangePreset) => {
    if (preset === value.preset) return;
    if (preset === "custom") {
      onChange({ ...value, preset: "custom" });
      return;
    }
    const next = getPresetRange(preset);
    setDraftRange({ from: next.from, to: next.to });
    onChange({ preset, from: next.from, to: next.to });
  };

  const handleCalendarSelect = (range?: DateRange) => {
    setDraftRange(range);
    if (!range?.from || !range?.to) return;
    const nextFrom = formatDateInput(range.from);
    const nextTo = formatDateInput(range.to);
    if (nextFrom === currentFrom && nextTo === currentTo) return;
    onChange({ preset: "custom", from: range.from, to: range.to });
  };

  const handleReset = () => {
    const preset = initialPresetRef.current;
    if (preset === "custom") {
      const initialRange = initialRangeRef.current;
      setDraftRange(initialRange);
      onChange({
        preset: "custom",
        from: initialRange?.from ?? null,
        to: initialRange?.to ?? null,
      });
      return;
    }
    const next = getPresetRange(preset);
    setDraftRange({ from: next.from, to: next.to });
    onChange({ preset, from: next.from, to: next.to });
  };

  return (
    <div className={cn("w-full", className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full justify-between font-normal"
            aria-label="Choose date range"
          >
            <span className="flex items-center gap-2 truncate">
              <CalendarIcon className="h-4 w-4 text-muted-foreground" />
              <span className="truncate">{displayLabel}</span>
            </span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <div className="flex max-w-[420px] overflow-hidden rounded-md bg-popover">
            <div className="flex w-36 flex-col gap-1 border-r border-border px-3 py-3">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Presets
              </div>
              {presets.map((preset) => (
                <Button
                  key={preset.key}
                  type="button"
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "justify-start px-2 text-xs",
                    value.preset === preset.key && "bg-muted text-foreground"
                  )}
                  aria-pressed={value.preset === preset.key}
                  onClick={() => handlePresetSelect(preset.key)}
                >
                  {preset.label}
                </Button>
              ))}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="mt-2 justify-start px-2 text-xs text-muted-foreground"
                onClick={handleReset}
              >
                Reset
              </Button>
            </div>
            <div className="p-3">
              <Calendar
                mode="range"
                selected={draftRange}
                fromDate={MIN_DATE}
                defaultMonth={draftRange?.from ?? draftRange?.to ?? new Date()}
                onSelect={handleCalendarSelect}
              />
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
