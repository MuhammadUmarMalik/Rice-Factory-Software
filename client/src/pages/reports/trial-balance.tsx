import { Download, Users, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import type { Account } from "@shared/schema";
import { ReportDetailDialog, useReportDetail } from "@/components/report-detail";

type TrialBalanceRow = {
  account: Account;
  debit: string;
  credit: string;
};

export default function TrialBalancePage() {
  const { t, isRTL, language } = useLanguage();
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const { data: rows = [], isLoading } = useQuery<TrialBalanceRow[]>({
    queryKey: ["/api/reports/trial-balance"],
  });

  const accountsWithBalance = rows;

  const totalDebit = accountsWithBalance.reduce((sum, a) => sum + parseFloat(a.debit || "0"), 0);
  const totalCredit = accountsWithBalance.reduce((sum, a) => sum + parseFloat(a.credit || "0"), 0);

  const columns: Column<TrialBalanceRow>[] = [
    {
      key: "name",
      title: "Account Name",
      titleUrdu: "کھاتہ نام",
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
      titleUrdu: "قسم",
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
                  ? "بینک"
                  : "Bank"
                : t("expenses")}
        </Badge>
      ),
    },
    {
      key: "debit",
      title: "Debit",
      titleUrdu: "ڈیبٹ",
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
      titleUrdu: "کریڈٹ",
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
            {language === "ur" ? "ٹرائل بیلنس رپورٹ" : "Trial balance report"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button variant="outline" data-testid="button-export">
            <Download className="h-4 w-4" />
            {t("export")}
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader
            className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}
          >
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "کل کھاتے" : "Total Accounts"}
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {accountsWithBalance.length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader
            className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}
          >
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "کل ڈیبٹ" : "Total Debit"}
            </CardTitle>
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
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {language === "ur" ? "کل کریڈٹ" : "Total Credit"}
            </CardTitle>
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
            data={accountsWithBalance}
            isLoading={isLoading}
            testIdPrefix="trial-balance"
            onRowClick={(row) => openDetail({ type: "account", id: row.account.id })}
          />

          <div className={`mt-4 pt-4 border-t flex justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">{language === "ur" ? "کل" : "Total"}</span>
            </div>
            <div className={`flex gap-12 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{language === "ur" ? "ڈیبٹ" : "Debit"}</p>
                <p className="font-mono font-bold text-lg">Rs. {totalDebit.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">{language === "ur" ? "کریڈٹ" : "Credit"}</p>
                <p className="font-mono font-bold text-lg">Rs. {totalCredit.toLocaleString()}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <ReportDetailDialog
        open={!!reference}
        onOpenChange={(open) => (!open ? closeDetail() : null)}
        detail={detail || null}
        isLoading={isDetailLoading}
      />
    </div>
  );
}
