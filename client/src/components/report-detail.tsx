import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { fetchWithAuth } from "@/lib/authFetch";

export type ReportReference = { type: string; id: number };

type LedgerEntry = {
  entryDate?: string | number | Date;
  description?: string;
  referenceType?: string | null;
  referenceId?: number | null;
  accountId?: number | null;
  accountName?: string | null;
  debit?: string;
  credit?: string;
};

type SaleDetail = { type: "sale"; sale: any; items?: any[]; customer?: any; ledgerEntries?: LedgerEntry[] };
type PurchaseDetail = { type: "purchase"; purchase: any; supplier?: any; ledgerEntries?: LedgerEntry[] };
type ProductDetail = { type: "product"; product: any; movements?: any[] };
type AccountDetail = { type: "account"; account: any; ledgerEntries?: LedgerEntry[] };
type VoucherDetail = { type: "receipt" | "payment" | "journal_voucher"; voucher: any; ledgerEntries?: LedgerEntry[] };
type ExpenseDetail = { type: "expense"; expense: any; expenseAccount?: any; payFromAccount?: any; ledgerEntries?: LedgerEntry[] };
type GenericDetail = Record<string, unknown>;

type ReportDetail = SaleDetail | PurchaseDetail | ProductDetail | AccountDetail | VoucherDetail | ExpenseDetail | GenericDetail | null;

const formatMoney = (val: string | number | undefined) => {
  const num = Number(val || 0);
  return `Rs. ${num.toLocaleString()}`;
};

export function useReportDetail() {
  const [reference, setReference] = useState<ReportReference | null>(null);

  const query = useQuery<ReportDetail>({
    queryKey: ["report-detail", reference?.type, reference?.id],
    enabled: !!reference,
    queryFn: async () => {
      if (!reference) return null;
      const params = new URLSearchParams({ type: reference.type, id: reference.id.toString() });
      const res = await fetchWithAuth(`/api/reports/detail?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load detail");
      return res.json();
    },
  });

  return {
    reference,
    detail: query.data,
    isLoading: query.isFetching,
    error: query.error,
    openDetail: (ref: ReportReference) => setReference(ref),
    closeDetail: () => setReference(null),
  };
}

function SummaryCard({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/40 shadow-sm" : ""}>
      <CardContent className="pt-3">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-lg font-semibold font-mono ${highlight ? "text-primary" : ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function LedgerTable({ entries }: { entries?: LedgerEntry[] }) {
  if (!entries || entries.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">Ledger Impact</p>
        <Badge variant="outline">{entries.length} lines</Badge>
      </div>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[120px]">Date</TableHead>
              <TableHead className="w-[200px]">Account</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Debit</TableHead>
              <TableHead className="text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((e, idx) => (
              <TableRow key={idx}>
                <TableCell className="font-mono text-xs">
                  {e.entryDate ? format(new Date(e.entryDate), "dd-MM-yyyy") : "-"}
                </TableCell>
                <TableCell className="font-medium">{e.accountName || (e.accountId ? `Account #${e.accountId}` : "-")}</TableCell>
                <TableCell>
                  <div className="font-medium">{e.description || "-"}</div>
                  {e.referenceType && (
                    <p className="text-xs text-muted-foreground">
                      Ref: {e.referenceType} #{e.referenceId}
                    </p>
                  )}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {Number(e.debit || 0) > 0 ? formatMoney(e.debit) : "-"}
                </TableCell>
                <TableCell className="text-right font-mono">
                  {Number(e.credit || 0) > 0 ? formatMoney(e.credit) : "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

function renderDetailContent(detail: ReportDetail) {
  if (!detail) return <p className="text-sm text-muted-foreground">No detail available.</p>;

  if ((detail as SaleDetail).type === "sale") {
    const d = detail as SaleDetail;
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge>Sale</Badge>
              <span className="text-lg font-semibold">{d.sale?.invoiceNumber}</span>
            </div>
            {d.sale?.saleDate && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(d.sale.saleDate), "dd MMM yyyy")}
              </p>
            )}
            {d.customer?.name && <p className="text-sm text-muted-foreground">Customer: {d.customer.name}</p>}
          </div>
          <div className="flex gap-2">
            <SummaryCard label="Net Amount" value={formatMoney(d.sale?.totalAmount)} highlight />
            <SummaryCard label="Items" value={(d.items || []).length} />
          </div>
        </div>
        {[
          { label: "Loading", amount: d.sale?.loadingCharges },
          { label: "Weighing", amount: d.sale?.weighingCharges },
          { label: "Other", amount: d.sale?.otherCharges },
        ].filter((c) => Number(c.amount || 0) !== 0).length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charge</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  { label: "Loading", amount: d.sale?.loadingCharges },
                  { label: "Weighing", amount: d.sale?.weighingCharges },
                  { label: "Other", amount: d.sale?.otherCharges },
                ]
                  .filter((c) => Number(c.amount || 0) !== 0)
                  .map((c, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-medium">{c.label}</TableCell>
                      <TableCell className="uppercase text-xs">{Number(c.amount || 0) < 0 ? "less" : "add"}</TableCell>
                      <TableCell className="text-right font-mono">{formatMoney(Math.abs(Number(c.amount || 0)))}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(d.items || []).length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.items!.map((it, idx) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">#{it.productId}</TableCell>
                    <TableCell className="text-right font-mono">{Number(it.quantity || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(it.pricePerUnit)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(it.totalPrice)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <LedgerTable entries={d.ledgerEntries} />
      </div>
    );
  }

  if ((detail as PurchaseDetail).type === "purchase") {
    const d = detail as PurchaseDetail;
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary">Purchase</Badge>
              <span className="text-lg font-semibold">{d.purchase?.invoiceNumber}</span>
            </div>
            {d.purchase?.purchaseDate && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(d.purchase.purchaseDate), "dd MMM yyyy")}
              </p>
            )}
            {d.supplier?.name && <p className="text-sm text-muted-foreground">Supplier: {d.supplier.name}</p>}
          </div>
          <div className="flex gap-2">
            <SummaryCard label="Grand Total" value={formatMoney(d.purchase?.totalAmount)} highlight />
            <SummaryCard label="Items" value={(d.purchase?.items || []).length} />
          </div>
        </div>
        {(d.purchase?.charges || []).length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Charge</TableHead>
                  <TableHead>Mode</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.purchase!.charges!.map((c: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">{c.type}</TableCell>
                    <TableCell className="uppercase text-xs">{c.mode}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(c.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        {(d.purchase?.items || []).length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Item</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.purchase!.items!.map((it: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-medium">#{it.productId}</TableCell>
                    <TableCell className="text-right font-mono">{Number(it.netWeightKg || 0).toLocaleString()}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(it.rate)}</TableCell>
                    <TableCell className="text-right font-mono">{formatMoney(it.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <LedgerTable entries={d.ledgerEntries} />
      </div>
    );
  }

  if ((detail as ExpenseDetail).type === "expense") {
    const d = detail as ExpenseDetail;
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge>Expense</Badge>
              <span className="text-lg font-semibold">{d.expense?.voucherNo}</span>
            </div>
            {d.expense?.expenseDate && (
              <p className="text-sm text-muted-foreground">
                {format(new Date(d.expense.expenseDate), "dd MMM yyyy")}
              </p>
            )}
            {d.expenseAccount?.name && (
              <p className="text-sm text-muted-foreground">Expense Account: {d.expenseAccount.name}</p>
            )}
            {d.payFromAccount?.name && (
              <p className="text-sm text-muted-foreground">Pay From: {d.payFromAccount.name}</p>
            )}
          </div>
          <div className="flex gap-2">
            <SummaryCard label="Amount" value={formatMoney(d.expense?.amount)} highlight />
          </div>
        </div>
        {d.expense?.description && (
          <div className="rounded-md border p-3 text-sm">
            <p className="text-xs uppercase text-muted-foreground">Description</p>
            <p className="mt-1">{d.expense.description}</p>
          </div>
        )}
        <LedgerTable entries={d.ledgerEntries} />
      </div>
    );
  }

  if ((detail as ProductDetail).type === "product") {
    const d = detail as ProductDetail;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Product</Badge>
          <span className="text-lg font-semibold">{d.product?.name || "Product"}</span>
          {d.product?.unit && <span className="text-sm text-muted-foreground">Unit: {d.product.unit}</span>}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Current Stock" value={`${d.product?.currentStock || 0} ${d.product?.unit || ""}`} />
          <SummaryCard label="Avg Purchase Price" value={formatMoney(d.product?.avgPurchasePrice)} />
          <SummaryCard label="Sale Price" value={formatMoney(d.product?.salePrice)} />
        </div>
        {(d.movements || []).length > 0 && (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Direction</TableHead>
                  <TableHead className="text-right">Quantity</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {d.movements!.map((m: any, idx: number) => (
                  <TableRow key={idx}>
                    <TableCell className="font-mono text-xs">
                      {m.date ? format(new Date(m.date), "dd-MM-yyyy") : "-"}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{m.refNo || "-"}</div>
                      {m.narration && <p className="text-xs text-muted-foreground">{m.narration}</p>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={m.direction === "in" ? "default" : "secondary"}>{m.direction || "-"}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono">{Number(m.qty || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    );
  }

  if ((detail as AccountDetail).type === "account") {
    const d = detail as AccountDetail;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline">Account</Badge>
          <span className="text-lg font-semibold">{d.account?.name || "Account"}</span>
          {d.account?.type && <Badge variant="secondary" className="capitalize">{d.account.type}</Badge>}
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Opening" value={formatMoney(d.account?.openingBalance)} />
          <SummaryCard label="Current" value={formatMoney(d.account?.currentBalance)} highlight />
          <SummaryCard label="Status" value={d.account?.isActive ? "Active" : "Inactive"} />
        </div>
        <LedgerTable entries={d.ledgerEntries} />
      </div>
    );
  }

  if ((detail as VoucherDetail).voucher) {
    const d = detail as VoucherDetail;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Badge>{d.type.toUpperCase()}</Badge>
          <span className="text-lg font-semibold">{d.voucher?.voucherNumber || "Voucher"}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <SummaryCard label="Total Debit" value={formatMoney(d.voucher?.totalDebit || d.voucher?.totalCredit)} highlight />
          {d.voucher?.voucherDate && (
            <SummaryCard label="Date" value={format(new Date(d.voucher.voucherDate), "dd MMM yyyy")} />
          )}
          <SummaryCard label="Type" value={d.voucher?.voucherType || d.type} />
        </div>
        <LedgerTable entries={d.ledgerEntries} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Unrecognized detail format; showing raw data.</p>
      <Separator />
      <pre className="text-xs whitespace-pre-wrap break-words">{JSON.stringify(detail, null, 2)}</pre>
    </div>
  );
}

export function ReportDetailDialog({
  open,
  onOpenChange,
  detail,
  isLoading,
  reference,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  detail: ReportDetail;
  isLoading?: boolean;
  reference?: ReportReference | null;
}) {
  const printConfig =
    reference?.type === "sale"
      ? { docKey: docKeys.salesInvoice, params: { saleId: reference.id }, title: "Sales Invoice" }
      : reference?.type === "purchase"
        ? { docKey: docKeys.purchaseInvoice, params: { purchaseId: reference.id }, title: "Purchase Invoice" }
        : reference?.type === "receipt"
          ? { docKey: docKeys.cashReceiptVoucher, params: { voucherId: reference.id }, title: "Cash Receipt Voucher" }
          : reference?.type === "payment"
            ? { docKey: docKeys.cashPaymentVoucher, params: { voucherId: reference.id }, title: "Cash Payment Voucher" }
            : reference?.type === "journal_voucher"
              ? { docKey: docKeys.journalVoucher, params: { voucherId: reference.id }, title: "Journal Voucher" }
              : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <div className="flex items-center justify-between gap-4">
            <DialogTitle>Details</DialogTitle>
            {printConfig && (
              <PrintActions
                docKey={printConfig.docKey}
                params={printConfig.params}
                title={printConfig.title}
              />
            )}
          </div>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        ) : (
          <ScrollArea className="max-h-[70vh] pr-2">
            {renderDetailContent(detail)}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
