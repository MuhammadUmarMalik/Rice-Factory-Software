import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account } from "@/types/schema";
import { format } from "date-fns";
import clsx from "clsx";
import { Link, useLocation } from "wouter";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";
import { SkeletonBox } from "@/components/ui/skeletons";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { useReportDateRange } from "@/hooks/useReportDateRange";

type LedgerReportRow = {
  id: number;
  entryDate: string | number | Date;
  narration: string;
  vchType: string;
  vchNo: string;
  debit: string;
  credit: string;
  runningBalance: string;
  referenceType?: string | null;
  referenceId?: number | null;
};

type LedgerReport = {
  account: Account;
  openingBalance: string;
  rows: LedgerReportRow[];
  totals: { debit: string; credit: string; closingBalance: string };
  validation?: { closingMatchesLastRow?: boolean; closingMatchesTotals?: boolean };
};

export default function LedgerPage() {
  const { t, isRTL } = useLanguage();
  const [location] = useLocation();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "today" });
  const [voucherType, setVoucherType] = useState<string>("all");
  const [narrationSearch, setNarrationSearch] = useState<string>("");

  const path = typeof window !== "undefined" ? window.location.pathname : location;
  const scope = path.includes("ledger-sales")
    ? "sales"
    : path.includes("ledger-purchases")
      ? "purchases"
      : path.includes("ledger-journal")
        ? "journal"
        : path.includes("ledger-expenses")
          ? "expenses"
          : path.includes("ledger-payroll")
            ? "payroll"
            : path.includes("ledger-employee")
              ? "employee"
              : path.includes("ledger-cash")
                ? "cash"
                : path.includes("ledger-bank")
                  ? "bank"
                  : undefined;
  const heading =
    scope === "sales"
      ? t("salesLedger")
      : scope === "purchases"
        ? t("purchaseLedger")
        : scope === "journal"
          ? t("journalLedger")
          : scope === "expenses"
            ? t("expenseLedger")
            : scope === "payroll"
              ? t("payrollLedger")
              : scope === "employee"
                ? t("employeePayLedger")
                : scope === "cash"
                  ? t("cashLedger")
                  : scope === "bank"
                    ? t("bankLedger")
                    : t("ledger");
  const subheading =
    scope === "sales"
      ? "Customer account ledger (sales entries only)"
      : scope === "purchases"
        ? "Supplier account ledger (purchase entries only)"
        : scope === "journal"
          ? "Journal voucher ledger with audit-ready narration."
          : scope === "expenses"
            ? "Expense ledger with pay-from impact."
            : scope === "payroll"
              ? "Salary expense and payroll postings."
              : scope === "employee"
                ? "Employee payable ledger with pay details."
                : scope === "cash"
                  ? "System cash ledger with running balance."
                  : scope === "bank"
                    ? "Bank account ledger with register-style flow."
                    : "Classic ledger layout with running balances.";

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: ledgerReport, isLoading } = useQuery<LedgerReport>({
    queryKey: ["/api/ledger", selectedAccountId, scope, fromDate, toDate, voucherType, narrationSearch],
    enabled: !!selectedAccountId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      if (scope) params.set("scope", scope);
      if (fromDate) params.set("startDate", fromDate);
      if (toDate) params.set("endDate", toDate);
      if (voucherType && voucherType !== "all") params.set("voucherType", voucherType);
      if (narrationSearch) params.set("narration", narrationSearch);
      const res = await fetchWithAuth(`/api/ledger?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
  });

  const accountChoices = useMemo(() => {
    if (scope === "sales") return accounts.filter((a) => a.type === "customer");
    if (scope === "purchases") return accounts.filter((a) => a.type === "supplier");
    if (scope === "expenses") return accounts.filter((a) => a.type === "expense");
    if (scope === "payroll") return accounts.filter((a) => a.type === "salary");
    if (scope === "employee") return accounts.filter((a) => a.type === "employee");
    if (scope === "bank") return accounts.filter((a) => a.type === "bank");
    if (scope === "cash") return accounts.filter((a) => a.isSystemAccount && a.name === "Cash in Hand");
    return accounts;
  }, [accounts, scope]);

  const selectedAccount = accountChoices.find((a) => a.id.toString() === selectedAccountId);
  const ledgerRows = ledgerReport?.rows || [];
  const openingBalance = ledgerReport?.openingBalance || selectedAccount?.openingBalance || "0";
  const totals = ledgerReport?.totals || {
    debit: "0",
    credit: "0",
    closingBalance: openingBalance,
  };
  const validation = ledgerReport?.validation;
  const voucherChoices = [
    { label: "All", value: "all" },
    { label: "Sale", value: "sale" },
    { label: "Purchase", value: "purchase" },
    { label: "Journal Voucher", value: "journal_voucher" },
    { label: "Receipt", value: "receipt" },
    { label: "Payment", value: "payment" },
    { label: "Expense", value: "expense" },
  ];
  const formatAmount = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(value || "0");
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  const normalSideForType = (type?: string | null) => {
    if (!type) return "DEBIT";
    const t = type.toLowerCase();
    return ["supplier", "liability", "equity", "income"].includes(t) ? "CREDIT" : "DEBIT";
  };
  const balanceLabel = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(value || "0");
    if (!Number.isFinite(num) || num === 0) return formatAmount(0);
    const normalSide = normalSideForType(selectedAccount?.type);
    const side = num >= 0
      ? (normalSide === "DEBIT" ? "DR" : "CR")
      : (normalSide === "DEBIT" ? "CR" : "DR");
    return `${formatAmount(Math.abs(num))} ${side}`;
  };
  const tabs = [
    { label: "General", href: "/reports/ledger", active: scope === undefined },
    { label: "Sales", href: "/reports/ledger-sales", active: scope === "sales" },
    { label: "Purchases", href: "/reports/ledger-purchases", active: scope === "purchases" },
    { label: "Journal", href: "/reports/ledger-journal", active: scope === "journal" },
    { label: "Expenses", href: "/reports/ledger-expenses", active: scope === "expenses" },
    { label: "Payroll", href: "/reports/ledger-payroll", active: scope === "payroll" },
    { label: "Employee Pay", href: "/reports/ledger-employee", active: scope === "employee" },
    { label: "Cash", href: "/reports/ledger-cash", active: scope === "cash" },
    { label: "Bank", href: "/reports/ledger-bank", active: scope === "bank" },
  ];

  useEffect(() => {
    if (scope === "journal" || scope === "payroll") {
      setVoucherType("journal_voucher");
    } else if (scope === "expenses") {
      setVoucherType("expense");
    } else {
      setVoucherType("all");
    }
  }, [scope]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
          <p className="text-sm text-muted-foreground">{subheading}</p>
        </div>
        <PrintActions
          docKey={docKeys.ledger}
          params={{
            accountId: selectedAccountId || undefined,
            scope: scope || undefined,
            startDate: fromDate || undefined,
            endDate: toDate || undefined,
            voucherType: voucherType !== "all" ? voucherType : undefined,
            narration: narrationSearch || undefined,
            language: isRTL ? "ur" : "en",
          }}
          title={heading}
          disabled={!selectedAccountId}
        />
      </div>

      <div className="flex items-center gap-2">
        {tabs.map((tab) => (
          <Link key={tab.href} href={tab.href}>
            <Button
              variant={tab.active ? "default" : "ghost"}
              className={clsx("px-4", tab.active ? "shadow-sm" : "text-muted-foreground")}
            >
              {tab.label}
            </Button>
          </Link>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            <div className="md:col-span-2">
              <Label>Select Account</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an account" />
                </SelectTrigger>
                <SelectContent>
                  {accountChoices.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Voucher Type</Label>
              <Select value={voucherType} onValueChange={setVoucherType}>
                <SelectTrigger>
                  <SelectValue placeholder="All vouchers" />
                </SelectTrigger>
                <SelectContent>
                  {voucherChoices.map((choice) => (
                    <SelectItem key={choice.value} value={choice.value}>
                      {choice.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Search Narration</Label>
              <Input
                placeholder="Purchase, freight, loading..."
                value={narrationSearch}
                onChange={(e) => setNarrationSearch(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedAccount && (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Ledger of</p>
            <CardTitle className="text-lg font-semibold">
              {selectedAccount.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Opening balance: {balanceLabel(openingBalance)}
            </p>
            {(fromDate || toDate) && (
              <p className="text-xs text-muted-foreground">
                {fromDate ? format(new Date(fromDate), "dd MMM yyyy") : "Start"} - {toDate ? format(new Date(toDate), "dd MMM yyyy") : "Today"}
              </p>
            )}
            {validation && (!validation.closingMatchesLastRow || !validation.closingMatchesTotals) && (
              <p className="text-xs text-destructive">
                Ledger check failed; totals or closing balance are out of sync.
              </p>
            )}
          </CardHeader>
          <CardContent className="overflow-auto">
            <div className="min-w-[780px] border rounded-lg bg-white">
              <div className="grid grid-cols-[90px,1fr,120px,120px,120px] bg-muted/60 text-[11px] font-semibold uppercase tracking-wide border-b">
                <div className="px-3 py-2 border-r">{isRTL ? "تاریخ" : "Date"}</div>
                <div className="px-3 py-2 border-r">{isRTL ? "تفصیل" : "Narration"}</div>
                <div className="px-3 py-2 border-r text-right">{isRTL ? "ڈیبٹ" : "Debit"}</div>
                <div className="px-3 py-2 border-r text-right">{isRTL ? "کریڈٹ" : "Credit"}</div>
                <div className="px-3 py-2 text-right">{isRTL ? "بقایا" : "Balance"}</div>
              </div>

              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className="grid grid-cols-[90px,1fr,120px,120px,120px] text-sm border-b last:border-b-0"
                    >
                      <div className="px-3 py-2 border-r">
                        <SkeletonBox className="h-3 w-12" />
                      </div>
                      <div className="px-3 py-2 border-r">
                        <SkeletonBox className="h-4 w-5/6" />
                      </div>
                      <div className="px-3 py-2 border-r">
                        <SkeletonBox className="h-4 w-16 ml-auto" />
                      </div>
                      <div className="px-3 py-2 border-r">
                        <SkeletonBox className="h-4 w-16 ml-auto" />
                      </div>
                      <div className="px-3 py-2">
                        <SkeletonBox className="h-4 w-20 ml-auto" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {ledgerRows.length === 0 ? (
                    <div className="px-3 py-3 text-center text-muted-foreground text-sm border-b">
                      No entries for this range.
                    </div>
                  ) : (
                    ledgerRows.map((entry, idx) => {
                      const debit = parseFloat(entry.debit || "0");
                      const credit = parseFloat(entry.credit || "0");
                      const balance = parseFloat(entry.runningBalance || "0");
                      const narration = entry.narration || "";
                      return (
                        <div
                          key={entry.id}
                          className={clsx(
                            "grid grid-cols-[90px,1fr,120px,120px,120px] text-sm border-b last:border-b-0",
                            idx % 2 === 0 ? "bg-white" : "bg-muted/20",
                          )}
                        >
                          <div className="px-3 py-2 border-r text-xs text-muted-foreground font-mono">
                            {format(new Date(entry.entryDate), "dd.MM.yy")}
                          </div>
                          <div className="px-3 py-2 border-r">
                            <div className="text-sm font-medium leading-5">{narration}</div>
                          </div>
                          <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                            {debit > 0 ? formatAmount(debit) : "-"}
                          </div>
                          <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                            {credit > 0 ? formatAmount(credit) : "-"}
                          </div>
                          <div className="px-3 py-2 text-right font-mono tabular-nums font-semibold">
                            {balanceLabel(balance)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </>
              )}

              {ledgerReport && !isLoading && (
                <div className="grid grid-cols-[90px,1fr,120px,120px,120px] bg-muted/80 text-sm font-semibold border-t">
                  <div className="px-3 py-2 border-r"></div>
                  <div className="px-3 py-2 border-r">{isRTL ? "کل" : "Totals"}</div>
                  <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                    {Number(totals.debit || 0) > 0 ? formatAmount(totals.debit) : "-"}
                  </div>
                  <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                    {Number(totals.credit || 0) > 0 ? formatAmount(totals.credit) : "-"}
                  </div>
                  <div className="px-3 py-2 text-right font-mono tabular-nums">
                    {balanceLabel(totals.closingBalance)}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedAccount && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            Select an account to view the ledger.
          </CardContent>
        </Card>
      )}

    </div>
  );
}
