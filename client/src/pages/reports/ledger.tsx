import { useMemo, useState } from "react";
import { Download, Calendar } from "lucide-react";
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
import type { Account } from "@shared/schema";
import { format } from "date-fns";
import clsx from "clsx";
import { Link, useLocation } from "wouter";
import { ReportDetailDialog, useReportDetail } from "@/components/report-detail";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";

type LedgerRow = {
  id: number;
  accountId: number;
  transactionType: "debit" | "credit";
  amount: string;
  balance?: string;
  description: string;
  descriptionUrdu?: string;
  referenceType?: string;
  referenceId?: number;
  entryDate: string | number | Date;
  openingBalance?: string;
  debit?: string;
  credit?: string;
  runningBalance?: string;
};

export default function LedgerPage() {
  const { t, isRTL } = useLanguage();
  const [location] = useLocation();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();

  const path = typeof window !== "undefined" ? window.location.pathname : location;
  const scope = path.includes("ledger-sales")
    ? "sales"
    : path.includes("ledger-purchases")
      ? "purchases"
      : undefined;
  const heading =
    scope === "sales" ? "Sales Ledger" : scope === "purchases" ? "Purchase Ledger" : t("ledger");
  const subheading =
    scope === "sales"
      ? "Customer account ledger (sales entries only)"
      : scope === "purchases"
        ? "Supplier account ledger (purchase entries only)"
        : "Classic ledger layout with running balances.";

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: ledgerEntries = [], isLoading } = useQuery<LedgerRow[]>({
    queryKey: ["/api/ledger", selectedAccountId, scope, dateFrom, dateTo],
    enabled: !!selectedAccountId,
    queryFn: async () => {
      const role = typeof window !== "undefined" ? localStorage.getItem("role") || "admin" : "admin";
      const params = new URLSearchParams();
      if (selectedAccountId) params.set("accountId", selectedAccountId);
      if (scope) params.set("scope", scope);
      if (dateFrom) params.set("startDate", dateFrom);
      if (dateTo) params.set("endDate", dateTo);
      const res = await fetch(`/api/ledger?${params.toString()}`, {
        credentials: "include",
        headers: role ? { "x-user-role": role } : {},
      });
      if (!res.ok) throw new Error("Failed to fetch ledger");
      return res.json();
    },
  });

  const accountChoices = useMemo(() => {
    if (scope === "sales") return accounts.filter((a) => a.type === "customer");
    if (scope === "purchases") return accounts.filter((a) => a.type === "supplier");
    return accounts;
  }, [accounts, scope]);

  const selectedAccount = accountChoices.find((a) => a.id.toString() === selectedAccountId);

  const orderedEntries = useMemo(
    () => [...ledgerEntries].sort((a, b) => new Date(a.entryDate).getTime() - new Date(b.entryDate).getTime()),
    [ledgerEntries],
  );

  const rangeOpening = orderedEntries.length
    ? parseFloat(orderedEntries[0].openingBalance || selectedAccount?.openingBalance || "0")
    : parseFloat(selectedAccount?.openingBalance || "0");

  const totals = orderedEntries.reduce(
    (acc, e) => {
      const debitVal = parseFloat(e.debit || (e.transactionType === "debit" ? e.amount : "0"));
      const creditVal = parseFloat(e.credit || (e.transactionType === "credit" ? e.amount : "0"));
      acc.debit += Number.isFinite(debitVal) ? debitVal : 0;
      acc.credit += Number.isFinite(creditVal) ? creditVal : 0;
      acc.closing = Number.isFinite(parseFloat(e.runningBalance || e.balance || "0"))
        ? parseFloat(e.runningBalance || e.balance || "0")
        : acc.closing;
      return acc;
    },
    {
      debit: 0,
      credit: 0,
      closing: rangeOpening,
    },
  );
  const netMovement = totals.debit - totals.credit;
  const netTotals = {
    debit: netMovement > 0 ? netMovement : 0,
    credit: netMovement < 0 ? Math.abs(netMovement) : 0,
    closing: totals.closing,
  };

  const tabs = [
    { label: "General", href: "/reports/ledger", active: scope === undefined },
    { label: "Sales", href: "/reports/ledger-sales", active: scope === "sales" },
    { label: "Purchases", href: "/reports/ledger-purchases", active: scope === "purchases" },
  ];

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
            startDate: dateFrom || undefined,
            endDate: dateTo || undefined,
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
          <div className="grid gap-4 md:grid-cols-4">
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
              <Label>From Date</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div>
              <Label>To Date</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
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
              Opening balance: Rs. {rangeOpening.toLocaleString()}
            </p>
          </CardHeader>
          <CardContent className="overflow-auto">
            <div className="min-w-[900px] border rounded-lg bg-white">
              <div className="grid grid-cols-[50px,120px,1fr,140px,140px,140px] bg-muted/60 text-xs font-semibold uppercase tracking-wide border-b">
                <div className="px-3 py-2 border-r">No.</div>
                <div className="px-3 py-2 border-r">Date</div>
                <div className="px-3 py-2 border-r">Particulars</div>
                <div className="px-3 py-2 border-r text-right">Debit</div>
                <div className="px-3 py-2 border-r text-right">Credit</div>
                <div className="px-3 py-2 text-right">Balance</div>
              </div>

              {isLoading ? (
                <div className="p-6 text-center text-muted-foreground text-sm">Loading entries...</div>
              ) : orderedEntries.length === 0 ? (
                <div className="p-6 text-center text-muted-foreground text-sm">No entries for this range.</div>
              ) : (
                orderedEntries.map((entry, idx) => {
                  const debit = parseFloat(entry.debit || (entry.transactionType === "debit" ? entry.amount : "0"));
                  const credit = parseFloat(entry.credit || (entry.transactionType === "credit" ? entry.amount : "0"));
                  const balance = parseFloat(entry.runningBalance || entry.balance || "0");
                  const allowedTypes = ["purchase", "sale", "receipt", "payment", "journal_voucher"];
                  const clickable = entry.referenceType && entry.referenceId && allowedTypes.includes(entry.referenceType);
                  return (
                    <div
                      key={entry.id}
                      className={clsx(
                        "grid grid-cols-[50px,120px,1fr,140px,140px,140px] text-sm border-b last:border-b-0",
                        clickable ? "cursor-pointer hover:bg-muted/40 transition-colors" : "",
                        idx % 2 === 0 ? "bg-white" : "bg-muted/30",
                      )}
                      onClick={() =>
                        clickable && entry.referenceType
                          ? openDetail({ type: entry.referenceType as any, id: Number(entry.referenceId) })
                          : undefined
                      }
                    >
                      <div className="px-3 py-2 border-r text-muted-foreground">{idx + 1}</div>
                      <div className="px-3 py-2 border-r">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Calendar className="h-3 w-3" />
                          <span className="font-mono">{format(new Date(entry.entryDate), "dd-MM-yyyy")}</span>
                        </div>
                      </div>
                      <div className="px-3 py-2 border-r">
                        <div className="font-medium">{entry.description}</div>
                        {entry.referenceType && (
                          <div className="text-xs text-muted-foreground">
                            Ref: {entry.referenceType} #{entry.referenceId}
                          </div>
                        )}
                      </div>
                      <div className="px-3 py-2 border-r text-right font-mono">
                        {debit > 0 ? `Rs. ${debit.toLocaleString()}` : "-"}
                      </div>
                      <div className="px-3 py-2 border-r text-right font-mono">
                        {credit > 0 ? `Rs. ${credit.toLocaleString()}` : "-"}
                      </div>
                      <div className="px-3 py-2 text-right font-mono font-semibold">
                        Rs. {balance.toLocaleString()}
                      </div>
                    </div>
                  );
                })
              )}

              {orderedEntries.length > 0 && (
                <div className="grid grid-cols-[50px,120px,1fr,140px,140px,140px] bg-muted/80 text-sm font-semibold border-t">
                  <div className="px-3 py-2 border-r">Total</div>
                  <div className="px-3 py-2 border-r"></div>
                  <div className="px-3 py-2 border-r"></div>
                  <div className="px-3 py-2 border-r text-right font-mono">
                    {netTotals.debit > 0 ? `Rs. ${netTotals.debit.toLocaleString()}` : "-"}
                  </div>
                  <div className="px-3 py-2 border-r text-right font-mono">
                    {netTotals.credit > 0 ? `Rs. ${netTotals.credit.toLocaleString()}` : "-"}
                  </div>
                  <div className="px-3 py-2 text-right font-mono">Rs. {netTotals.closing.toLocaleString()}</div>
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
