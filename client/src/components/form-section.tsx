import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Titled block inside a long entry form (purchase / sale). Groups with space and a hairline, not a nested card. */
export function FormSection({
  title,
  description,
  action,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("space-y-4 border-t pt-6 first:border-t-0 first:pt-0", className)}>
      <div className="flex items-end justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
          {description && <p className="text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

/** One label/value line in a summary panel; figures align in columns. */
export function SummaryRow({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-3", className)}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end font-medium tabular-nums">{value}</dd>
    </div>
  );
}
