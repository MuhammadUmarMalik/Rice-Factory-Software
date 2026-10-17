import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { DataTable, type Column } from "@/components/data-table";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";
import { useLanguage } from "@/contexts/language-context";
import { fetchWithAuth } from "@/lib/authFetch";

type Figures = {
  batches: number;
  inputKg: number;
  headRice: number;
  broken: number;
  nakoo: number;
  wastage: number;
  headRicePct: number;
  brokenPct: number;
  nakooPct: number;
  wastagePct: number;
};

type RecoveryReport = {
  overall: Figures;
  bySource: (Figures & { source: string })[];
  byMonth: (Figures & { month: string })[];
  batches: (Figures & { id: number; batchNumber: string; source: string; completedAt: number })[];
};

const kg = (n: number) => <span className="font-mono">{n.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>;
const pct = (n: number) => <span className="font-mono">{n.toFixed(2)}%</span>;

/** The percentage columns every grouping shares, after its own leading column(s). */
function figureColumns<T extends Figures>(): Column<T>[] {
  return [
    { key: "batches", title: "Batches", align: "right" },
    { key: "inputKg", title: "Paddy in (kg)", align: "right", render: (r) => kg(r.inputKg) },
    {
      key: "headRicePct",
      title: "Head rice",
      align: "right",
      render: (r) => <span className="font-mono font-semibold text-primary">{r.headRicePct.toFixed(2)}%</span>,
    },
    { key: "brokenPct", title: "Broken", align: "right", render: (r) => pct(r.brokenPct) },
    { key: "nakooPct", title: "Nakoo", align: "right", render: (r) => pct(r.nakooPct) },
    { key: "wastagePct", title: "Wastage", align: "right", render: (r) => pct(r.wastagePct) },
  ];
}

export default function RecoveryReportPage() {
  const { t } = useLanguage();
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "all" });

  const { data, isLoading } = useQuery<RecoveryReport>({
    queryKey: ["/api/reports/recovery", fromDate, toDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetchWithAuth(`/api/reports/recovery?${params}`);
      if (!res.ok) throw new Error("Failed to load recovery report");
      return res.json();
    },
  });

  const sourceColumns = useMemo<Column<RecoveryReport["bySource"][number]>[]>(
    () => [{ key: "source", title: "Paddy" }, ...figureColumns()],
    [],
  );
  const monthColumns = useMemo<Column<RecoveryReport["byMonth"][number]>[]>(
    () => [
      { key: "month", title: "Month", render: (r) => format(new Date(`${r.month}-01T00:00:00`), "MMM yyyy") },
      ...figureColumns(),
    ],
    [],
  );
  const batchColumns = useMemo<Column<RecoveryReport["batches"][number]>[]>(
    () => [
      { key: "batchNumber", title: "Batch", render: (r) => <span className="font-mono">{r.batchNumber}</span> },
      { key: "completedAt", title: "Completed", render: (r) => format(new Date(r.completedAt), "dd-MM-yyyy") },
      { key: "source", title: "Paddy" },
      ...figureColumns<RecoveryReport["batches"][number]>().filter((c) => c.key !== "batches"),
    ],
    [],
  );

  const o = data?.overall;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("recoveryReport")}</h1>
        <p className="text-sm text-muted-foreground">
          Output of completed processing batches as a share of paddy put in. Wastage = input − all outputs.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6">
          <Label>Completed between</Label>
          <DateRangeFilter value={range} onChange={setRange} />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-5">
        <Summary label="Paddy processed (kg)" value={o ? o.inputKg.toLocaleString() : "—"} />
        <Summary label="Head rice" value={o ? `${o.headRicePct.toFixed(2)}%` : "—"} highlight />
        <Summary label="Broken" value={o ? `${o.brokenPct.toFixed(2)}%` : "—"} />
        <Summary label="Nakoo" value={o ? `${o.nakooPct.toFixed(2)}%` : "—"} />
        <Summary label="Wastage" value={o ? `${o.wastagePct.toFixed(2)}%` : "—"} />
      </div>

      <Section title="By paddy variety">
        <DataTable columns={sourceColumns} data={data?.bySource ?? []} isLoading={isLoading} emptyMessage="No completed batches" />
      </Section>
      <Section title="By month">
        <DataTable columns={monthColumns} data={data?.byMonth ?? []} isLoading={isLoading} emptyMessage="No completed batches" />
      </Section>
      <Section title="Batches">
        <DataTable columns={batchColumns} data={data?.batches ?? []} isLoading={isLoading} searchable emptyMessage="No completed batches" />
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Summary({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/30 shadow-sm" : ""}>
      <CardContent className="pt-4 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold font-mono ${highlight ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
