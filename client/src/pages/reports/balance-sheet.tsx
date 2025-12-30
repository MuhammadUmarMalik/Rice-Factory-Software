import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { SkeletonBox, SkeletonTableRow } from "@/components/ui/skeletons";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

type BalanceSheet = {
  asOfDate: string | number | Date;
  assets: { cash: string; bank: string; receivables: string; inventory: string; total: string };
  liabilities: { payables: string; expensesPayable: string; total: string };
  equity: { capital: string; retainedEarnings: string; total: string };
  totals: { assets: string; liabilitiesAndEquity: string };
};

type BalanceSheetRow =
  | { type: "section"; label: string }
  | { type: "line" | "total" | "grand"; label: string; debit?: string; credit?: string };

export default function BalanceSheetPage() {
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "today" });
  const asOfDate = toDate || fromDate;

  const { data, isLoading, error } = useQuery<BalanceSheet>({
    queryKey: ["/api/financial/balance-sheet", asOfDate],
    enabled: !!asOfDate,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("asOfDate", asOfDate);
      const res = await fetchWithAuth(`/api/financial/balance-sheet?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load balance sheet");
      return res.json();
    },
  });

  const rows: BalanceSheetRow[] = [
    { type: "section", label: "Assets" },
    { type: "line", label: "Cash", debit: data?.assets.cash },
    { type: "line", label: "Bank", debit: data?.assets.bank },
    { type: "line", label: "Receivables", debit: data?.assets.receivables },
    { type: "line", label: "Inventory", debit: data?.assets.inventory },
    { type: "total", label: "Total Assets", debit: data?.assets.total },
    { type: "section", label: "Liabilities" },
    { type: "line", label: "Payables", credit: data?.liabilities.payables },
    { type: "line", label: "Expenses Payable", credit: data?.liabilities.expensesPayable },
    { type: "total", label: "Total Liabilities", credit: data?.liabilities.total },
    { type: "section", label: "Equity" },
    { type: "line", label: "Capital", credit: data?.equity.capital },
    { type: "line", label: "Retained Earnings", credit: data?.equity.retainedEarnings },
    { type: "total", label: "Total Equity", credit: data?.equity.total },
    { type: "grand", label: "Total Liabilities + Equity", credit: data?.totals.liabilitiesAndEquity },
  ];

  const lineDebitCents = rows.reduce(
    (sum, row) => sum + (row.type === "line" && row.debit ? toCents(row.debit) : 0),
    0,
  );
  const lineCreditCents = rows.reduce(
    (sum, row) => sum + (row.type === "line" && row.credit ? toCents(row.credit) : 0),
    0,
  );

  const totalDebitCents = lineDebitCents;
  const totalCreditCents = lineCreditCents;
  const balanced = totalDebitCents === totalCreditCents;
  const differenceCents = Math.abs(totalDebitCents - totalCreditCents);

  const assetsComponentCents = [
    data?.assets.cash,
    data?.assets.bank,
    data?.assets.receivables,
    data?.assets.inventory,
  ].reduce((sum, value) => sum + (value ? toCents(value) : 0), 0);
  const assetsTotalCents = data?.assets.total ? toCents(data.assets.total) : 0;
  const liabilitiesComponentCents = [
    data?.liabilities.payables,
    data?.liabilities.expensesPayable,
  ].reduce((sum, value) => sum + (value ? toCents(value) : 0), 0);
  const liabilitiesTotalCents = data?.liabilities.total ? toCents(data.liabilities.total) : 0;
  const equityComponentCents = [
    data?.equity.capital,
    data?.equity.retainedEarnings,
  ].reduce((sum, value) => sum + (value ? toCents(value) : 0), 0);
  const equityTotalCents = data?.equity.total ? toCents(data.equity.total) : 0;
  const liabilitiesAndEquityTotalCents = data?.totals.liabilitiesAndEquity
    ? toCents(data.totals.liabilitiesAndEquity)
    : 0;

  return (
    <div className="p-6 space-y-6">
      <Card className="relative overflow-hidden border-muted/60">
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(900px_circle_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background/60 to-background" />
        <div className="pointer-events-none absolute -top-20 right-0 h-52 w-52 rounded-full bg-chart-2/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-0 h-64 w-64 rounded-full bg-chart-4/10 blur-3xl" />
        <CardContent className="pt-6">
          <div className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Statement</p>
              <h1 className="text-3xl font-semibold tracking-tight">Balance Sheet</h1>
              <p className="text-sm text-muted-foreground">
                Snapshot of assets, liabilities, and equity at a specific date.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 md:items-end">
            <div>
              <Label>As of Date</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
              <div className="rounded-lg border border-border/70 bg-background/70 px-3 py-2">
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="flex items-center justify-between gap-2">
                  {isLoading ? (
                    <>
                      <SkeletonBox className="h-4 w-24" />
                      <SkeletonBox className="h-6 w-16" />
                    </>
                  ) : (
                    <>
                      <span className="text-sm font-medium">
                        {balanced ? "Balanced" : "Needs Review"}
                      </span>
                      <Badge
                        variant={balanced ? "default" : "destructive"}
                        className={balanced ? "bg-emerald-500/15 text-emerald-700" : ""}
                      >
                        {balanced ? "OK" : "Mismatch"}
                      </Badge>
                    </>
                  )}
                </div>
              </div>
              <div className="md:col-span-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>Currency: PKR</span>
                <div className="flex items-center gap-3">
                  {isLoading && <SkeletonBox className="h-3 w-16" />}
                  {error && <span className="text-destructive">{(error as Error).message}</span>}
                </div>
              </div>
              <div className="md:col-span-2">
                <PrintActions
                  docKey={docKeys.balanceSheet}
                  params={{ asOfDate: asOfDate || undefined }}
                  title="Balance Sheet"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-muted/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Balance Sheet (Table Format)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="w-16">SrNo#</TableHead>
                <TableHead>Account Name</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, index) => (
                  <SkeletonTableRow key={index} columns={4} />
                ))
              ) : (
                <>
                  {(() => {
                    let srNo = 0;
                    return rows.map((row, index) => {
                      const rowNo = row.type === "line" ? (srNo += 1) : "";

                      if (row.type === "section") {
                        return (
                          <TableRow key={`${row.label}-${index}`} className="bg-muted/30">
                            <TableCell />
                            <TableCell
                              colSpan={3}
                              className="font-semibold uppercase tracking-wide text-xs text-muted-foreground"
                            >
                              {row.label}
                            </TableCell>
                          </TableRow>
                        );
                      }

                      const isTotal = row.type === "total" || row.type === "grand";
                      return (
                        <TableRow
                          key={`${row.label}-${index}`}
                          className={row.type === "grand" ? (balanced ? "bg-emerald-500/10" : "bg-destructive/10") : ""}
                        >
                          <TableCell>{rowNo}</TableCell>
                          <TableCell className={isTotal ? "font-semibold" : ""}>{row.label}</TableCell>
                          <TableCell className={`text-right font-mono ${isTotal ? "font-semibold" : ""}`}>
                            {row.debit ? `Rs. ${formatAmount(row.debit)}` : ""}
                          </TableCell>
                          <TableCell className={`text-right font-mono ${isTotal ? "font-semibold" : ""}`}>
                            {row.credit ? `Rs. ${formatAmount(row.credit)}` : ""}
                          </TableCell>
                        </TableRow>
                      );
                    });
                  })()}
                  <TableRow className="bg-muted/20">
                    <TableCell />
                    <TableCell className="font-semibold">Total Debit / Credit</TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      Rs. {formatAmount(fromCents(totalDebitCents))}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      Rs. {formatAmount(fromCents(totalCreditCents))}
                    </TableCell>
                  </TableRow>
                </>
              )}
            </TableBody>
          </Table>

          {isLoading ? (
            <div className="mt-3">
              <SkeletonBox className="h-4 w-64" />
            </div>
          ) : (
            <>
              <div className={`mt-3 text-sm font-medium ${balanced ? "text-emerald-700" : "text-destructive"}`}>
                {balanced
                  ? "Total Debit equals Total Credit."
                  : `Totals do not match. Difference: Rs. ${formatAmount(fromCents(differenceCents))}`}
              </div>

              {!balanced && (
                <div className="mt-3 space-y-1 text-xs text-muted-foreground">
                  {assetsComponentCents !== assetsTotalCents && (
                    <div>
                      Assets components mismatch by Rs. {formatAmount(fromCents(Math.abs(assetsComponentCents - assetsTotalCents)))}.
                    </div>
                  )}
                  {liabilitiesComponentCents !== liabilitiesTotalCents && (
                    <div>
                      Liabilities components mismatch by Rs. {formatAmount(fromCents(Math.abs(liabilitiesComponentCents - liabilitiesTotalCents)))}.
                    </div>
                  )}
                  {equityComponentCents !== equityTotalCents && (
                    <div>
                      Equity components mismatch by Rs. {formatAmount(fromCents(Math.abs(equityComponentCents - equityTotalCents)))}.
                    </div>
                  )}
                  {lineCreditCents !== liabilitiesAndEquityTotalCents && (
                    <div>
                      Liabilities + Equity total mismatch by Rs. {formatAmount(fromCents(Math.abs(lineCreditCents - liabilitiesAndEquityTotalCents)))}.
                    </div>
                  )}
                  <div>
                    Check ledger postings, account mappings, and inventory valuation if the mismatch persists.
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function formatAmount(value?: string) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function toCents(value?: string) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

function fromCents(value: number) {
  return (value / 100).toFixed(2);
}
