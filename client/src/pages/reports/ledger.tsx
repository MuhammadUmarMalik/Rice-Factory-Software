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
import type { Product } from "@/types/schema";

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
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "all" });
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
                  : path.includes("ledger-raw")
                    ? "raw"
                    : path.includes("ledger-bio")
                      ? "bio"
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
                    : scope === "raw"
                      ? t("rawProductsLedger")
                      : scope === "bio"
                        ? t("bioProductsLedger")
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
                    : scope === "raw"
                      ? "Raw product stock ledger with quantities."
                      : scope === "bio"
                        ? "Bio product stock ledger with quantities."
                        : "Classic ledger layout with running balances.";

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const accountChoices = useMemo(() => {
    if (scope === "raw" || scope === "bio") return [];
    if (scope === "sales") return accounts.filter((a) => a.type === "customer");
    if (scope === "purchases") return accounts.filter((a) => a.type === "supplier");
    if (scope === "expenses") return accounts.filter((a) => a.type === "expense");
    if (scope === "payroll") return accounts.filter((a) => a.type === "salary");
    if (scope === "employee") return accounts.filter((a) => a.type === "employee");
    if (scope === "bank") return accounts.filter((a) => a.type === "bank");
    if (scope === "cash") return accounts.filter((a) => a.isSystemAccount && a.name === "Cash in Hand");
    return accounts;
  }, [accounts, scope]);

  // Products are listed in the dropdown for the Raw/Bio tabs and also for
  // the General and Journal ledgers, so stock movement can be reviewed from
  // the same screen. Product ids are prefixed with "product-" so they never
  // collide with account ids.
  const productChoices = useMemo(() => {
    if (scope === "raw") return products.filter((p) => (p.productType || "").toLowerCase() === "raw");
    if (scope === "bio") return products.filter((p) => (p.productType || "").toLowerCase() === "bio");
    if (scope === undefined || scope === "journal") return products;
    return [];
  }, [products, scope]);

  const isProductScope = scope === "raw" || scope === "bio";

  const selectedAccount =
    selectedAccountId && !selectedAccountId.startsWith("product-")
      ? accountChoices.find((a) => a.id.toString() === selectedAccountId)
      : undefined;

  const selectedProduct = selectedAccountId?.startsWith("product-")
    ? products.find((p) => `product-${p.id}` === selectedAccountId)
    : undefined;

  const isProductView = !!selectedProduct;

  const { data: ledgerReport, isLoading } = useQuery<LedgerReport>({
    queryKey: ["/api/ledger", selectedAccount?.id, scope, fromDate, toDate, voucherType, narrationSearch],
    enabled: !!selectedAccount,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedAccount) params.set("accountId", String(selectedAccount.id));
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
    { label: "Raw Products", href: "/reports/ledger-raw", active: scope === "raw" },
    { label: "Bio Products", href: "/reports/ledger-bio", active: scope === "bio" },
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

  // Reset the selection when switching tabs so a product/account chosen in
  // one ledger is not carried over into another.
  useEffect(() => {
    setSelectedAccountId("");
  }, [scope]);

  // Deep-link: arriving from a product ledger via "View Journal Voucher"
  // carries ?product=product-<id>; honour it by pre-selecting the product.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const productParam = new URLSearchParams(window.location.search).get("product");
    if (productParam && productParam.startsWith("product-")) {
      setSelectedAccountId(productParam);
    }
  }, [scope]);

  useEffect(() => {
    if (scope === "cash" && accountChoices.length === 1 && !selectedAccountId) {
      setSelectedAccountId(String(accountChoices[0].id));
    }
  }, [scope, accountChoices, selectedAccountId]);

  const { data: productLedger, isLoading: isProductLedgerLoading } = useQuery({
    queryKey: ["/api/reports/product-ledger", selectedProduct?.id, fromDate, toDate],
    enabled: !!selectedProduct,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedProduct) params.set("productId", String(selectedProduct.id));
      if (fromDate) params.set("startDate", fromDate);
      if (toDate) params.set("endDate", toDate);
      const res = await fetchWithAuth(`/api/reports/product-ledger?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch product ledger");
      return res.json();
    },
  });

  const activeRows = isProductView ? (productLedger?.rows || []) : (ledgerReport?.rows || []);
  const activeOpening = isProductView ? (productLedger?.openingBalance || "0") : (ledgerReport?.openingBalance || selectedAccount?.openingBalance || "0");
  const activeTotals = isProductView
    ? { debit: productLedger?.totals.quantityIn || "0", credit: productLedger?.totals.quantityOut || "0", closingBalance: productLedger?.totals.closingBalance || "0" }
    : (ledgerReport?.totals || { debit: "0", credit: "0", closingBalance: activeOpening });
  const activeIsLoading = isProductView ? isProductLedgerLoading : isLoading;

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
            accountId: selectedAccount?.id.toString() || undefined,
            scope: scope || undefined,
            startDate: fromDate || undefined,
            endDate: toDate || undefined,
            voucherType: voucherType !== "all" ? voucherType : undefined,
            narration: narrationSearch || undefined,
            language: isRTL ? "ur" : "en",
          }}
          title={heading}
          disabled={!selectedAccount}
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
              <Label>{productChoices.length > 0 ? "Select Account / Product" : "Select Account"}</Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger>
                  <SelectValue placeholder={productChoices.length > 0 ? "Choose an account or product" : "Choose an account"} />
                </SelectTrigger>
                <SelectContent>
                  {accountChoices.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      {account.name}
                    </SelectItem>
                  ))}
                  {productChoices.map((product) => (
                    <SelectItem key={`product-${product.id}`} value={`product-${product.id}`}>
                      {product.name} ({product.productType})
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

      {(selectedAccount || selectedProduct) && (
        <Card className="shadow-sm">
          <CardHeader className="flex flex-col gap-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {isProductView ? "Product Ledger of" : "Ledger of"}
            </p>
            <CardTitle className="text-lg font-semibold">
              {isProductView ? selectedProduct?.name : selectedAccount?.name}
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Opening balance: {isProductView ? `${activeOpening} ${selectedProduct?.unit || "kg"}` : balanceLabel(activeOpening)}
            </p>
            {(fromDate || toDate) && (
              <p className="text-xs text-muted-foreground">
                {fromDate ? format(new Date(fromDate), "dd MMM yyyy") : "Start"} - {toDate ? format(new Date(toDate), "dd MMM yyyy") : "Today"}
              </p>
            )}
            {isProductView && (
              <p className="text-xs text-muted-foreground">
                <Link
                  href={`/reports/ledger-journal?product=product-${selectedProduct.id}`}
                  className="text-primary hover:underline"
                >
                  View Journal Voucher →
                </Link>
              </p>
            )}
            {validation && !isProductView && (!validation.closingMatchesLastRow || !validation.closingMatchesTotals) && (
              <p className="text-xs text-destructive">
                Ledger check failed; totals or closing balance are out of sync.
              </p>
            )}
          </CardHeader>
          <CardContent className="overflow-auto">
            <div className="min-w-[780px] border rounded-lg bg-white">
              {isProductView ? (
                <div className="grid grid-cols-[90px,100px,100px,1fr,80px,90px,90px,90px,90px,100px] bg-muted/60 text-[11px] font-semibold uppercase tracking-wide border-b">
                  <div className="px-2 py-2 border-r">{isRTL ? "تاریخ" : "Date"}</div>
                  <div className="px-2 py-2 border-r">{isRTL ? "واؤچر" : "Vch Type"}</div>
                  <div className="px-2 py-2 border-r">{isRTL ? "واؤڈر نمبر" : "Vch No"}</div>
                  <div className="px-2 py-2 border-r">{isRTL ? "تفصیل" : "Narration"}</div>
                  <div className="px-2 py-2 border-r">{isRTL ? "پارٹی" : "Party"}</div>
                  <div className="px-2 py-2 border-r text-right">{isRTL ? "آن" : "In"}</div>
                  <div className="px-2 py-2 border-r text-right">{isRTL ? "آؤٹ" : "Out"}</div>
                  <div className="px-2 py-2 border-r text-right">{isRTL ? "ریٹ" : "Rate"}</div>
                  <div className="px-2 py-2 border-r text-right">{isRTL ? "رقم" : "Amount"}</div>
                  <div className="px-2 py-2 text-right">{isRTL ? "بیلنس" : "Balance"}</div>
                </div>
              ) : (
                <div className="grid grid-cols-[90px,1fr,120px,120px,120px] bg-muted/60 text-[11px] font-semibold uppercase tracking-wide border-b">
                  <div className="px-3 py-2 border-r">{isRTL ? "تاریخ" : "Date"}</div>
                  <div className="px-3 py-2 border-r">{isRTL ? "تفصیل" : "Narration"}</div>
                  <div className="px-3 py-2 border-r text-right">{isRTL ? "ڈیبٹ" : "Debit"}</div>
                  <div className="px-3 py-2 border-r text-right">{isRTL ? "کریڈٹ" : "Credit"}</div>
                  <div className="px-3 py-2 text-right">{isRTL ? "بقایا" : "Balance"}</div>
                </div>
              )}

              {activeIsLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 6 }).map((_, index) => (
                    <div
                      key={index}
                      className={clsx(
                        "grid text-sm border-b last:border-b-0",
                        isProductView
                          ? "grid-cols-[90px,100px,100px,1fr,80px,90px,90px,90px,90px,100px]"
                          : "grid-cols-[90px,1fr,120px,120px,120px]",
                      )}
                    >
                      <div className="px-3 py-2 border-r"><SkeletonBox className="h-3 w-12" /></div>
                      <div className="px-3 py-2 border-r"><SkeletonBox className="h-4 w-5/6" /></div>
                      <div className="px-3 py-2 border-r"><SkeletonBox className="h-4 w-16 ml-auto" /></div>
                      <div className="px-3 py-2 border-r"><SkeletonBox className="h-4 w-16 ml-auto" /></div>
                      <div className="px-3 py-2"><SkeletonBox className="h-4 w-20 ml-auto" /></div>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  {activeRows.length === 0 ? (
                    <div className="px-3 py-3 text-center text-muted-foreground text-sm border-b">
                      No entries for this range.
                    </div>
                  ) : (
                    isProductView ? (
                      (activeRows as any[]).map((entry: any, idx: number) => (
                        <div
                          key={`${entry.voucherType}-${entry.id}-${idx}`}
                          className={clsx(
                            "grid grid-cols-[90px,100px,100px,1fr,80px,90px,90px,90px,90px,100px] text-sm border-b last:border-b-0",
                            idx % 2 === 0 ? "bg-white" : "bg-muted/20",
                          )}
                        >
                          <div className="px-2 py-2 border-r text-xs text-muted-foreground font-mono">
                            {format(new Date(entry.entryDate), "dd.MM.yy")}
                          </div>
                          <div className="px-2 py-2 border-r">
                            <span className={clsx(
                              "text-xs font-medium px-1.5 py-0.5 rounded",
                              entry.voucherType === "Purchase" && "bg-green-100 text-green-700",
                              entry.voucherType === "Sale" && "bg-blue-100 text-blue-700",
                              entry.voucherType === "Processing-In" && "bg-purple-100 text-purple-700",
                              entry.voucherType === "Processing-Out" && "bg-orange-100 text-orange-700",
                            )}>
                              {entry.voucherType}
                            </span>
                          </div>
                          <div className="px-2 py-2 border-r text-xs font-mono text-muted-foreground">
                            {entry.voucherNo}
                          </div>
                          <div className="px-2 py-2 border-r">
                            <div className="text-sm font-medium leading-5">{entry.narration}</div>
                          </div>
                          <div className="px-2 py-2 border-r text-xs text-muted-foreground">
                            {entry.partyName}
                          </div>
                          <div className="px-2 py-2 border-r text-right font-mono tabular-nums text-green-700">
                            {parseFloat(entry.quantityIn) > 0 ? Number(entry.quantityIn).toLocaleString() : "-"}
                          </div>
                          <div className="px-2 py-2 border-r text-right font-mono tabular-nums text-red-700">
                            {parseFloat(entry.quantityOut) > 0 ? Number(entry.quantityOut).toLocaleString() : "-"}
                          </div>
                          <div className="px-2 py-2 border-r text-right font-mono tabular-nums text-muted-foreground">
                            {parseFloat(entry.rate) > 0 ? formatAmount(entry.rate) : "-"}
                          </div>
                          <div className="px-2 py-2 border-r text-right font-mono tabular-nums">
                            {parseFloat(entry.amount) > 0 ? formatAmount(entry.amount) : "-"}
                          </div>
                          <div className="px-2 py-2 text-right font-mono tabular-nums font-semibold">
                            {Number(entry.runningBalance).toLocaleString()}
                          </div>
                        </div>
                      ))
                    ) : (
                      (activeRows as any[]).map((entry: any, idx: number) => {
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
                    )
                  )}
                </>
              )}

              {!activeIsLoading && activeRows.length > 0 && (
                <div className={clsx(
                  "bg-muted/80 text-sm font-semibold border-t",
                  isProductView
                    ? "grid grid-cols-[90px,100px,100px,1fr,80px,90px,90px,90px,90px,100px]"
                    : "grid grid-cols-[90px,1fr,120px,120px,120px]",
                )}>
                  {!isProductView && <div className="px-3 py-2 border-r"></div>}
                  {isProductView && <div className="px-2 py-2 border-r"></div>}
                  {isProductView && <div className="px-2 py-2 border-r"></div>}
                  {isProductView && <div className="px-2 py-2 border-r"></div>}
                  <div className={clsx("px-2 py-2 border-r", isProductView && "px-2")}>{isRTL ? "کل" : "Totals"}</div>
                  {isProductView && <div className="px-2 py-2 border-r"></div>}
                  <div className={clsx("py-2 border-r text-right font-mono tabular-nums", isProductView ? "px-2" : "px-3")}>
                    {isProductView
                      ? Number(activeTotals.debit || 0) > 0 ? Number(activeTotals.debit).toLocaleString() : "-"
                      : Number(activeTotals.debit || 0) > 0 ? formatAmount(activeTotals.debit) : "-"}
                  </div>
                  <div className={clsx("py-2 border-r text-right font-mono tabular-nums", isProductView ? "px-2" : "px-3")}>
                    {isProductView
                      ? Number(activeTotals.credit || 0) > 0 ? Number(activeTotals.credit).toLocaleString() : "-"
                      : Number(activeTotals.credit || 0) > 0 ? formatAmount(activeTotals.credit) : "-"}
                  </div>
                  {isProductView && <div className="px-2 py-2 border-r"></div>}
                  {isProductView && <div className="px-2 py-2 border-r"></div>}
                  <div className={clsx("py-2 text-right font-mono tabular-nums", isProductView ? "px-2" : "px-3")}>
                    {isProductView
                      ? Number(activeTotals.closingBalance).toLocaleString()
                      : balanceLabel(activeTotals.closingBalance)}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!selectedAccount && !selectedProduct && (
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground text-sm">
            {isProductScope
              ? "Select a product to view the ledger."
              : scope === undefined || scope === "journal"
                ? "Select an account or product to view the ledger."
                : "Select an account to view the ledger."}
          </CardContent>
        </Card>
      )}

    </div>
  );
}
