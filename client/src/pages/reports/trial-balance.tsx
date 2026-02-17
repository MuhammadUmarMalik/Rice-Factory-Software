import { Suspense, lazy } from "react";
import { Download, Users, Wallet, ArrowUpRight, ArrowDownRight, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "@/types/schema";
import { useReportDetail } from "@/components/report-detail-hook";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { Label } from "@/components/ui/label";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

const ReportDetailDialog = lazy(() =>
  import("@/components/report-detail-dialog").then((mod) => ({
    default: mod.ReportDetailDialog,
  })),
);

type TrialBalanceRow = {
  account: Account;
  debit: string;
  credit: string;
};

type TrialBalanceResponse = {
  rows: TrialBalanceRow[];
  totals: { debit: string; credit: string };
  validation: { balanced: boolean; difference: string };
};

export default function TrialBalancePage() {
  const { t, isRTL, language } = useLanguage();
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "today" });
  const asOfDate = toDate || fromDate;

  const { data, isLoading } = useQuery<TrialBalanceResponse>({
    queryKey: ["/api/reports/trial-balance", asOfDate],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (asOfDate) params.set("asOfDate", asOfDate);
      const res = await fetch(`/api/reports/trial-balance?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch trial balance");
      return res.json();
    },
  });

  const rows = data?.rows || [];
  const totalDebit = parseFloat(data?.totals.debit || "0");
  const totalCredit = parseFloat(data?.totals.credit || "0");
  const balanced = data?.validation.balanced ?? true;
  const difference = data?.validation.difference || "0";

  const columns: Column<TrialBalanceRow>[] = [
    {
      key: "name",
      title: "Account Name",
      render: (item) => (
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div
            className={`flex h-9 w-9 items-center justify-center rounded-lg ${
              item.account.type === "customer"
                ? "bg-primary/10"
                : item.account.type === "supplier"
                  ? "bg-chart-2/10"
                  : item.account.type === "bank"
                    ? "bg-chart-5/10"
                    : "bg-chart-3/10"
            }`}
          >
            <Users
              className={`h-4 w-4 ${
                item.account.type === "customer"
                  ? "text-primary"
                  : item.account.type === "supplier"
                    ? "text-chart-2"
                    : item.account.type === "bank"
                      ? "text-chart-5"
                      : "text-chart-3"
              }`}
            />
          </div>
          <div>
            <p className="font-medium">{item.account.name}</p>
            {item.account.nameUrdu && (
              <p className="text-sm text-muted-foreground font-urdu">{item.account.nameUrdu}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "type",
      title: "Type",
      align: "center",
      render: (item) => (
        <Badge
          variant={
            item.account.type === "customer"
              ? "default"
              : item.account.type === "supplier"
                ? "secondary"
                : "outline"
          }
          className="text-xs"
        >
          {item.account.type === "customer"
            ? t("customer")
            : item.account.type === "supplier"
              ? t("supplier")
              : item.account.type === "bank"
                ? language === "ur"
                  ? "Bank"
                  : "Bank"
                : t("expenses")}
        </Badge>
      ),
    },
    {
      key: "debit",
      title: "Debit",
      align: "right",
      render: (item) => {
        const balance = parseFloat(item.debit || "0");
        return balance > 0 ? (
          <div className={`flex items-center gap-1 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <ArrowUpRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono font-medium">Rs. {balance.toLocaleString()}</span>
          </div>
        ) : null;
      },
    },
    {
      key: "credit",
      title: "Credit",
      align: "right",
      render: (item) => {
        const balance = parseFloat(item.credit || "0");
        return balance > 0 ? (
          <div className={`flex items-center gap-1 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <ArrowDownRight className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono font-medium">Rs. {balance.toLocaleString()}</span>
          </div>
        ) : null;
      },
    },
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("trialBalance")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "Trial balance report" : "Trial balance report"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <PrintActions
            docKey={docKeys.trialBalance}
            params={{ asOfDate: asOfDate || undefined }}
            title="Trial Balance"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-4 ${isRTL ? "direction-rtl" : ""}`}>
            <div className="md:col-span-2">
              <Label>As of Date</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            <div className="md:col-span-2 flex items-end justify-end">
              <div className={`text-sm ${balanced ? "text-emerald-700" : "text-destructive"} flex items-center gap-2`}>
                {balanced ? "Balanced" : `Mismatch: Rs. ${Number(difference).toLocaleString()}`}
                {!balanced && <AlertTriangle className="h-4 w-4" />}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader
            className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}
          >
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Accounts</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {rows.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}
          >
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Debit</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              Rs. {totalDebit.toLocaleString()}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}
          >
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Credit</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              Rs. {totalCredit.toLocaleString()}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={rows}
            isLoading={isLoading}
            testIdPrefix="trial-balance"
            onRowClick={(row) => openDetail({ type: "account", id: row.account.id })}
          />

          <div className={`mt-4 pt-4 border-t flex justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{language === "ur" ? "Total" : "Total"}</span>
            </div>
            <div className={`flex gap-12 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Debit</p>
                <p className="font-mono font-bold text-lg">Rs. {totalDebit.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Credit</p>
                <p className="font-mono font-bold text-lg">Rs. {totalCredit.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {reference ? (
        <Suspense fallback={null}>
          <ReportDetailDialog
            reference={reference}
            open={!!reference}
            onOpenChange={(open: boolean) => (!open ? closeDetail() : null)}
            detail={detail || null}
            isLoading={isDetailLoading}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
