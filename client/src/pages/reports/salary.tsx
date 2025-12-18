import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery } from "@tanstack/react-query";

type SalaryRow = {
  employee: string;
  salaryMonth: string;
  basicSalary: string;
  allowances: string;
  deductions: string;
  netSalary: string;
};

type SalaryReport = {
  rows: SalaryRow[];
  totals: { netSalary: string };
};

export default function SalaryAccountPage() {
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const { data, isLoading } = useQuery<SalaryReport>({
    queryKey: ["/api/financial/salary", fromDate, toDate],
    enabled: !!fromDate && !!toDate,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "" : "";
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
  const totalNet = Number(data?.totals.netSalary || 0);

  const columns: Column<SalaryRow>[] = useMemo(
    () => [
      { key: "employee", title: "Employee" },
      { key: "salaryMonth", title: "Salary Month", render: (r) => <span className="font-mono">{r.salaryMonth}</span> },
      { key: "basicSalary", title: "Basic Salary", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.basicSalary || 0).toLocaleString()}</span> },
      { key: "allowances", title: "Allowances", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.allowances || 0).toLocaleString()}</span> },
      { key: "deductions", title: "Deductions", align: "right", render: (r) => <span className="font-mono">Rs. {Number(r.deductions || 0).toLocaleString()}</span> },
      { key: "netSalary", title: "Net Salary", align: "right", render: (r) => <span className="font-mono font-semibold">Rs. {Number(r.netSalary || 0).toLocaleString()}</span> },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Salary Account</h1>
        <p className="text-sm text-muted-foreground">Salary expense ledger summarized by month and employee.</p>
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
            <div className="md:col-span-2 flex items-end justify-end">
              <div className="text-sm text-muted-foreground">
                Total Net Salary: <span className="font-mono font-semibold">{totalNet.toLocaleString()}</span>
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
          <DataTable columns={columns} data={rows} isLoading={isLoading} searchable emptyMessage="No salary entries found" />
        </CardContent>
      </Card>
    </div>
  );
}

