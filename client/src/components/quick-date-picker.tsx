import { addDays, endOfMonth, format, startOfMonth, subDays } from "date-fns";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type DatePreset = "today" | "yesterday" | "tomorrow" | "weekly" | "monthly" | "custom";

export type SingleDateValue = {
  mode: DatePreset;
  date: string; // YYYY-MM-DD
};

export type RangeDateValue = {
  mode: DatePreset;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
};

export function presetToRange(mode: DatePreset): { from: string; to: string } {
  const today = new Date();
  switch (mode) {
    case "yesterday": {
      const d = subDays(today, 1);
      const ds = format(d, "yyyy-MM-dd");
      return { from: ds, to: ds };
    }
    case "tomorrow": {
      const d = addDays(today, 1);
      const ds = format(d, "yyyy-MM-dd");
      return { from: ds, to: ds };
    }
    case "weekly": {
      const from = format(subDays(today, 6), "yyyy-MM-dd");
      const to = format(today, "yyyy-MM-dd");
      return { from, to };
    }
    case "monthly": {
      const from = format(startOfMonth(today), "yyyy-MM-dd");
      const to = format(endOfMonth(today), "yyyy-MM-dd");
      return { from, to };
    }
    case "today":
    default: {
      const ds = format(today, "yyyy-MM-dd");
      return { from: ds, to: ds };
    }
  }
}

const presets: Array<{ key: DatePreset; label: string }> = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "custom", label: "Custom" },
];

export function QuickDateRange({
  value,
  onChange,
}: {
  value: RangeDateValue;
  onChange: (next: RangeDateValue) => void;
}) {
  const resolved = useMemo(() => {
    if (value.mode === "custom") return value;
    return { ...value, ...presetToRange(value.mode) };
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.key}
            type="button"
            variant={value.mode === p.key ? "default" : "outline"}
            size="sm"
            onClick={() =>
              onChange(
                p.key === "custom"
                  ? { ...value, mode: p.key }
                  : { mode: p.key, ...presetToRange(p.key) }
              )
            }
          >
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="date"
          value={resolved.from}
          onChange={(e) => onChange({ ...resolved, mode: "custom", from: e.target.value })}
          className={cn(value.mode !== "custom" && "opacity-80")}
        />
        <Input
          type="date"
          value={resolved.to}
          onChange={(e) => onChange({ ...resolved, mode: "custom", to: e.target.value })}
          className={cn(value.mode !== "custom" && "opacity-80")}
        />
      </div>
    </div>
  );
}

export function QuickDateSingle({
  value,
  onChange,
}: {
  value: SingleDateValue;
  onChange: (next: SingleDateValue) => void;
}) {
  const resolved = useMemo(() => {
    if (value.mode === "custom") return value;
    const { from } = presetToRange(value.mode);
    return { ...value, date: from };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {presets.map((p) => (
          <Button
            key={p.key}
            type="button"
            variant={value.mode === p.key ? "default" : "outline"}
            size="sm"
            onClick={() =>
              onChange(
                p.key === "custom"
                  ? { ...value, mode: p.key }
                  : { mode: p.key, date: presetToRange(p.key).from }
              )
            }
          >
            {p.label}
          </Button>
        ))}
      </div>
      <Input
        type="date"
        value={resolved.date}
        onChange={(e) => onChange({ mode: "custom", date: e.target.value })}
        className={cn(value.mode !== "custom" && "opacity-80")}
      />
    </div>
  );
}
