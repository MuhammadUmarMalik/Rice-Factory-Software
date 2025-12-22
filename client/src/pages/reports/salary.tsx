import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";
import { ReportDetailDialog, useReportDetail } from "@/components/report-detail";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";

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
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data, isLoading } = useQuery<SalaryReport>({
    queryKey: ["/api/financial/salary", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "admin" : "admin";
      const params = new URLSearchParams();
      params.set("fromDate", fromDate);
      params.set("toDate", toDate);
      const res = await fetch(`/api/financial/salary?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
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
          disabled={!fromDate || !toDate}
        />
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-4">
            <div>
              <Label>From Date</Label>
              <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
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

      <ReportDetailDialog
        reference={reference}
        open={!!reference}
        onOpenChange={(open) => (!open ? closeDetail() : null)}
        detail={detail || null}
        isLoading={isDetailLoading}
      />
    </div>
  );
}
