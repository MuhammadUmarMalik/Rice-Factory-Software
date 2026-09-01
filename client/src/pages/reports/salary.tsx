import { Suspense, lazy, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { useReportDetail } from "@/components/report-detail-hook";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

const ReportDetailDialog = lazy(() =>
  import("@/components/report-detail-dialog").then((mod) => ({
    default: mod.ReportDetailDialog,
  })),
);

type SalaryRow = {
  accountId: number | null;
  employee: string;
  salaryMonth: string;
  basicSalary: string;
  allowances: string;
  deductions: string;
  netSalary: string;
  paidAmount: string;
  balanceAmount: string;
};

type SalaryReport = {
  rows: SalaryRow[];
  totals: { basicSalary: string; allowances: string; deductions: string; netSalary: string; paidAmount: string; balanceAmount: string };
};

export default function SalaryAccountPage() {
  const { range, setRange, fromDate, toDate, isReady } = useReportDateRange({ preset: "all" });
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data, isLoading } = useQuery<SalaryReport>({
    queryKey: ["/api/financial/salary", fromDate, toDate],
    enabled: isReady,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetchWithAuth(`/api/financial/salary?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load salary account");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totals = data?.totals || {
    basicSalary: "0",
    allowances: "0",
    deductions: "0",
    netSalary: "0",
    paidAmount: "0",
    balanceAmount: "0",
  };

  const columns: Column<SalaryRow>[] = useMemo(
    () => [
      { key: "employee", title: "Employee" },
      { key: "salaryMonth", title: "Salary Month", render: (r) => <span className="font-mono">{r.salaryMonth}</span> },
      { key: "basicSalary", title: "Basic Salary", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.basicSalary || 0).toLocaleString()}</span> },
      { key: "allowances", title: "Allowances", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.allowances || 0).toLocaleString()}</span> },
      { key: "deductions", title: "Deductions", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.deductions || 0).toLocaleString()}</span> },
      { key: "netSalary", title: "Net Salary", align: "right", render: (r) => <span className="font-mono font-semibold">Rs. {Number(r.netSalary || 0).toLocaleString()}</span> },
      { key: "paidAmount", title: "Paid", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.paidAmount || 0).toLocaleString()}</span> },
      { key: "balanceAmount", title: "Balance", align: "right", render: (r) => <span className="font-mono text-destructive">Rs. {Number(r.balanceAmount || 0).toLocaleString()}</span> },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Salary Account</h1>
          <p className="text-sm text-muted-foreground">Salary expense ledger summarized by month and employee.</p>
        </div>
        <PrintActions
          docKey={docKeys.salary}
          params={{ fromDate: fromDate || undefined, toDate: toDate || undefined }}
          title="Salary Account"
          disabled={!isReady}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div className="md:col-span-2">
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            <div className="md:col-span-2 flex items-end justify-end gap-6 text-sm text-muted-foreground">
              <div>
                Total Net Salary: <span className="font-mono font-semibold">{Number(totals.netSalary || 0).toLocaleString()}</span>
              </div>
              <div>
                Paid: <span className="font-mono font-semibold">{Number(totals.paidAmount || 0).toLocaleString()}</span>
              </div>
              <div>
                Balance: <span className="font-mono font-semibold text-destructive">{Number(totals.balanceAmount || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Entries</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            searchable
            emptyMessage="No salary entries found"
            onRowClick={(row) =>
              row.accountId ? openDetail({ type: "account", id: row.accountId }) : undefined
            }
          />
        </CardContent>
      </Card>

      {reference ? (
        <Suspense fallback={null}>
          <ReportDetailDialog
            reference={reference}
            open={!!reference}
            onOpenChange={(open) => (!open ? closeDetail() : null)}
            detail={detail || null}
            isLoading={isDetailLoading}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
