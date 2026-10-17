import { useMemo, useState } from "react";
import { Link } from "wouter";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import {
  ArrowDownLeft,
  ArrowUpRight,
  BookOpen,
  FileText,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CashReceiptForm } from "@/components/Cash/CashReceiptForm";
import { CashPaymentForm } from "@/components/Cash/CashPaymentForm";
import { useLanguage } from "@/contexts/language-context";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";
import {
  deletePayment,
  deleteReceipt,
  getBalance,
  getPayments,
  getReceipts,
  getSummary,
  setOpeningBalance,
  updatePayment,
  updateReceipt,
  type CashBalance,
} from "@/api/cash.api";
import { useAuthStore } from "@/stores/auth.store";
import { can, Roles } from "@/lib/roles";
import { useToast } from "@/hooks/use-toast";
import { formatMoney } from "@/utils/formatters";
import { todayLocal, toLocalDateString } from "@/utils/dateRanges";

type Kind = "receipt" | "payment";

type ReceiptRow = {
  id: number;
  voucherNo: string;
  receiptDate: string | number;
  receivedFrom: string;
  amount: string;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
};

type PaymentRow = {
  id: number;
  voucherNo: string;
  paymentDate: string | number;
  paidTo: string;
  amount: string;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
};

/** Receipts and payments normalised into one shape so the page has one list, one set of dialogs. */
type CashEntry = {
  kind: Kind;
  id: number;
  voucherNo: string;
  date: Date | null;
  party: string;
  amount: number;
  description: string;
  reference: string | null;
};

type Filter = "all" | Kind;

const RECENT_LIMIT = 15;

function parseAmount(value: unknown): number {
  const n = typeof value === "number" ? value : parseFloat(String(value ?? ""));
  return Number.isFinite(n) ? n : 0;
}

/** Server dates arrive as ISO strings, epoch seconds or epoch ms. */
function toDate(value: unknown): Date | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(value);
  const d = Number.isFinite(numeric)
    ? new Date(Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

const fmtDate = (d: Date | null) => (d ? format(d, "dd MMM yyyy") : "-");

function referenceLabel(type?: string | null, id?: number | null) {
  return type ? `${type}${id ? ` #${id}` : ""}` : null;
}

function fromReceipt(r: ReceiptRow): CashEntry {
  return {
    kind: "receipt",
    id: r.id,
    voucherNo: r.voucherNo,
    date: toDate(r.receiptDate),
    party: r.receivedFrom ?? "",
    amount: parseAmount(r.amount),
    description: r.description ?? "",
    reference: referenceLabel(r.referenceType, r.referenceId),
  };
}

function fromPayment(p: PaymentRow): CashEntry {
  return {
    kind: "payment",
    id: p.id,
    voucherNo: p.voucherNo,
    date: toDate(p.paymentDate),
    party: p.paidTo ?? "",
    amount: parseAmount(p.amount),
    description: p.description ?? "",
    reference: referenceLabel(p.referenceType, p.referenceId),
  };
}

export default function CashDashboardPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();

  const [receiptOpen, setReceiptOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [viewing, setViewing] = useState<CashEntry | null>(null);
  const [editing, setEditing] = useState<CashEntry | null>(null);
  const [deleting, setDeleting] = useState<CashEntry | null>(null);
  const [editForm, setEditForm] = useState({ date: "", party: "", amount: "", description: "" });
  const [openingOpen, setOpeningOpen] = useState(false);
  const [openingForm, setOpeningForm] = useState("");

  const role = useAuthStore((state) => state.user?.role || "operator");
  const canSetOpeningBalance = can(role, Roles.finance);

  // Today's figures. Its openingBalance is yesterday's closing, not the stored
  // opening balance, which only /api/cash/balance returns (used to prefill the form).
  const summaryQuery = useQuery({ queryKey: ["/api/cash/summary"], queryFn: getSummary });
  const { data: cashBalance } = useQuery<CashBalance>({
    queryKey: ["/api/cash/balance"],
    queryFn: () => getBalance(),
    enabled: canSetOpeningBalance,
  });
  const receiptsQuery = useQuery<ReceiptRow[]>({ queryKey: ["/api/cash/receipts"], queryFn: () => getReceipts() });
  const paymentsQuery = useQuery<PaymentRow[]>({ queryKey: ["/api/cash/payments"], queryFn: () => getPayments() });

  const entries = useMemo(() => {
    const receipts = Array.isArray(receiptsQuery.data) ? receiptsQuery.data.map(fromReceipt) : [];
    const payments = Array.isArray(paymentsQuery.data) ? paymentsQuery.data.map(fromPayment) : [];
    return [...receipts, ...payments].sort(
      (a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0) || b.id - a.id,
    );
  }, [receiptsQuery.data, paymentsQuery.data]);

  const visible = useMemo(
    () => (filter === "all" ? entries : entries.filter((e) => e.kind === filter)).slice(0, RECENT_LIMIT),
    [entries, filter],
  );

  const listLoading = receiptsQuery.isLoading || paymentsQuery.isLoading;
  const listError = receiptsQuery.isError || paymentsQuery.isError;
  const retryList = () => {
    receiptsQuery.refetch();
    paymentsQuery.refetch();
  };

  const summary = summaryQuery.data;
  const netToday = (summary?.todayReceipts ?? 0) - (summary?.todayPayments ?? 0);

  const invalidateCash = () => invalidateApi(invalidationGroups.cash);
  const errorToast = (fallback: string) => (err: unknown) =>
    toast({ title: err instanceof Error ? err.message : fallback, variant: "destructive" });

  const updateMutation = useMutation({
    mutationKey: ["/api/cash", "update"],
    meta: scopedInvalidation,
    mutationFn: ({ entry, form }: { entry: CashEntry; form: typeof editForm }): Promise<unknown> => {
      const description = form.description.trim() || undefined;
      const amount = String(parseAmount(form.amount));
      return entry.kind === "receipt"
        ? updateReceipt(entry.id, { receiptDate: form.date, receivedFrom: form.party.trim(), amount, description })
        : updatePayment(entry.id, { paymentDate: form.date, paidTo: form.party.trim(), amount, description });
    },
    onSuccess: async (_data, { entry }) => {
      await invalidateCash();
      setEditing(null);
      toast({ title: entry.kind === "receipt" ? "Receipt updated" : "Payment updated" });
    },
    onError: errorToast("Failed to save changes"),
  });

  const deleteMutation = useMutation({
    mutationKey: ["/api/cash", "delete"],
    meta: scopedInvalidation,
    mutationFn: (entry: CashEntry) => (entry.kind === "receipt" ? deleteReceipt(entry.id) : deletePayment(entry.id)),
    onSuccess: async (_data, entry) => {
      await invalidateCash();
      setDeleting(null);
      toast({ title: entry.kind === "receipt" ? "Receipt deleted" : "Payment deleted" });
    },
    onError: errorToast("Failed to delete"),
  });

  const openingMutation = useMutation({
    mutationKey: ["/api/cash/opening-balance"],
    meta: scopedInvalidation,
    mutationFn: (openingBalance: string) => setOpeningBalance(openingBalance),
    onSuccess: async () => {
      await invalidateCash();
      setOpeningOpen(false);
      toast({ title: "Opening balance updated" });
    },
    onError: errorToast("Failed to update opening balance"),
  });

  const openEdit = (entry: CashEntry) => {
    setViewing(null);
    setEditing(entry);
    setEditForm({
      date: entry.date ? toLocalDateString(entry.date) : todayLocal(),
      party: entry.party,
      amount: String(entry.amount),
      description: entry.description,
    });
  };

  const editAmount = parseAmount(editForm.amount);
  const editInvalid = !editForm.date || !editForm.party.trim() || editAmount <= 0;
  const openingInvalid = !openingForm.trim() || parseAmount(openingForm) < 0;

  const openOpening = () => {
    setOpeningForm(String(cashBalance?.openingBalance ?? 0));
    setOpeningOpen(true);
  };

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: t("all") },
    { value: "receipt", label: t("receiptsFilter") },
    { value: "payment", label: t("paymentsFilter") },
  ];

  const row = isRTL ? "flex-row-reverse" : "";

  return (
    <div className={`mx-auto w-full max-w-7xl space-y-6 p-4 md:p-6 ${isRTL ? "font-urdu" : ""}`}>
      {/* Header: one primary action, one secondary, the rest tucked into "More". */}
      <header className={`flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between ${isRTL ? "sm:flex-row-reverse text-right" : ""}`}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("cashInHand")}</h1>
          <p className="text-sm text-muted-foreground">{t("cashInHandSubtitle")}</p>
        </div>
        <div className={`flex items-center gap-2 ${row}`}>
          <Button onClick={() => setReceiptOpen(true)}>
            <Plus className="h-4 w-4" /> {t("newReceipt")}
          </Button>
          <Button variant="outline" className="bg-card" onClick={() => setPaymentOpen(true)}>
            <Plus className="h-4 w-4" /> {t("newPayment")}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon" className="bg-card" aria-label={t("moreActions")}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align={isRTL ? "start" : "end"} className="w-52">
              {canSetOpeningBalance && (
                <DropdownMenuItem onSelect={openOpening}>
                  <Wallet className="h-4 w-4" /> {t("setOpeningBalance")}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem asChild>
                <Link href="/journal">
                  <FileText className="h-4 w-4" /> {t("journalVoucher")}
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href="/reports/cash-ledger">
                  <BookOpen className="h-4 w-4" /> {t("cashLedger")}
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Position: the figure people come here for, then how today got there. */}
      <Card className="overflow-hidden" aria-busy={summaryQuery.isLoading}>
        <div className={`flex flex-col gap-3 p-5 md:flex-row md:items-end md:justify-between md:p-6 ${isRTL ? "md:flex-row-reverse text-right" : ""}`}>
          <div className="space-y-1">
            <p className="text-sm font-medium text-muted-foreground">{t("cashInHandNow")}</p>
            {summaryQuery.isLoading ? (
              <Skeleton className="h-10 w-56" />
            ) : summaryQuery.isError ? (
              <p className="text-sm text-destructive">
                {t("failedToLoadCash")}{" "}
                <button type="button" className="underline underline-offset-2" onClick={() => summaryQuery.refetch()}>
                  {t("retry")}
                </button>
              </p>
            ) : (
              <p className="text-4xl font-semibold tracking-tight tabular-nums">{formatMoney(summary?.closingBalance)}</p>
            )}
            <p className="text-xs text-muted-foreground">{format(new Date(), "EEEE, dd MMM yyyy")}</p>
          </div>
          {!summaryQuery.isLoading && !summaryQuery.isError && (
            <span
              className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium tabular-nums ${
                netToday >= 0 ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
              }`}
            >
              {netToday >= 0 ? <ArrowDownLeft className="h-3.5 w-3.5" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
              {t("netToday")} {netToday >= 0 ? "+" : "−"}
              {formatMoney(Math.abs(netToday))}
            </span>
          )}
        </div>
        {/* Opening + receipts − payments = the figure above. Stacks on mobile. */}
        <dl className={`grid divide-y border-t bg-muted/30 sm:grid-cols-3 sm:divide-y-0 ${isRTL ? "sm:divide-x-reverse" : ""} sm:divide-x`}>
          {[
            { label: t("openingToday"), value: summary?.openingBalance, sign: "", tone: "text-foreground" },
            { label: t("receiptsToday"), value: summary?.todayReceipts, sign: "+ ", tone: "text-primary" },
            { label: t("paymentsToday"), value: summary?.todayPayments, sign: "− ", tone: "text-destructive" },
          ].map((item) => (
            <div key={item.label} className={`space-y-1 px-5 py-4 md:px-6 ${isRTL ? "text-right" : ""}`}>
              <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
              <dd className={`text-lg font-semibold tabular-nums ${item.tone}`}>
                {summaryQuery.isLoading ? <Skeleton className="h-6 w-28" /> : `${item.sign}${formatMoney(item.value)}`}
              </dd>
            </div>
          ))}
        </dl>
      </Card>

      {/* Activity: receipts and payments in one timeline, signed like a cash book. */}
      <Card>
        <div className={`flex flex-col gap-3 border-b p-4 sm:flex-row sm:items-center sm:justify-between md:px-6 ${isRTL ? "sm:flex-row-reverse" : ""}`}>
          <h2 className="text-base font-semibold">{t("recentActivity")}</h2>
          <div className={`flex items-center gap-3 ${row}`}>
            <div role="tablist" aria-label={t("recentActivity")} className="inline-flex rounded-lg bg-muted p-1">
              {filters.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.value}
                  onClick={() => setFilter(f.value)}
                  className={`rounded-md px-3 py-1 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                    filter === f.value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <Link href="/reports/cash-ledger" className="whitespace-nowrap text-sm font-medium text-primary hover:underline underline-offset-4">
              {t("viewAll")}
            </Link>
          </div>
        </div>

        {listLoading ? (
          <ul className="divide-y" aria-busy="true">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center gap-4 px-4 py-3 md:px-6">
                <Skeleton className="h-9 w-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-5 w-24" />
              </li>
            ))}
          </ul>
        ) : listError ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-destructive">{t("failedToLoadCash")}</p>
            <Button variant="outline" size="sm" onClick={retryList}>
              <RefreshCw className="h-4 w-4" /> {t("retry")}
            </Button>
          </div>
        ) : visible.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-14 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Wallet className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="space-y-1">
              <p className="font-medium">{t("noCashActivity")}</p>
              <p className="text-sm text-muted-foreground">{t("noCashActivityHint")}</p>
            </div>
            <Button size="sm" onClick={() => (filter === "payment" ? setPaymentOpen(true) : setReceiptOpen(true))}>
              <Plus className="h-4 w-4" /> {filter === "payment" ? t("newPayment") : t("newReceipt")}
            </Button>
          </div>
        ) : (
          <ul className="divide-y">
            {visible.map((e) => {
              const isIn = e.kind === "receipt";
              return (
                <li key={`${e.kind}-${e.id}`} className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:gap-4 md:px-6 ${row}`}>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      isIn ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                    }`}
                    aria-hidden="true"
                  >
                    {isIn ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </span>
                  {/* The text block is the row's main hit target; it opens the details. */}
                  <button
                    type="button"
                    onClick={() => setViewing(e)}
                    className={`min-w-0 flex-1 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${isRTL ? "text-right" : "text-left"}`}
                  >
                    <span className="block truncate font-medium">{e.party || "-"}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <span className="font-mono">{e.voucherNo}</span> · {fmtDate(e.date)}
                      {e.description && <span className="hidden md:inline"> · {e.description}</span>}
                    </span>
                  </button>
                  <span className={`shrink-0 text-sm font-semibold tabular-nums ${isIn ? "text-primary" : "text-destructive"}`}>
                    {isIn ? "+" : "−"}
                    {formatMoney(e.amount)}
                  </span>
                  <span className="sr-only">{isIn ? t("receiptsFilter") : t("paymentsFilter")}</span>
                  <div className={`flex shrink-0 items-center gap-0.5 ${row}`}>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" aria-label={t("edit")} onClick={() => openEdit(e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={t("delete")} onClick={() => setDeleting(e)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <CashReceiptForm open={receiptOpen} onOpenChange={setReceiptOpen} />
      <CashPaymentForm open={paymentOpen} onOpenChange={setPaymentOpen} />

      {/* Details */}
      <Dialog open={!!viewing} onOpenChange={(v) => !v && setViewing(null)}>
        <DialogContent className={`sm:max-w-md ${isRTL ? "font-urdu text-right" : ""}`}>
          <DialogHeader>
            <DialogTitle>{viewing?.kind === "payment" ? t("paymentDetails") : t("receiptDetails")}</DialogTitle>
            <DialogDescription className="font-mono">{viewing?.voucherNo}</DialogDescription>
          </DialogHeader>
          {viewing && (
            <>
              <p className={`text-3xl font-semibold tracking-tight tabular-nums ${viewing.kind === "receipt" ? "text-primary" : "text-destructive"}`}>
                {viewing.kind === "receipt" ? "+" : "−"}
                {formatMoney(viewing.amount)}
              </p>
              <dl className="divide-y rounded-lg border text-sm">
                {[
                  [t("date"), fmtDate(viewing.date)],
                  [viewing.kind === "receipt" ? t("receivedFrom") : t("paidTo"), viewing.party || "-"],
                  [t("reference"), viewing.reference ?? t("manualEntry")],
                  [t("description"), viewing.description || "-"],
                ].map(([k, v]) => (
                  <div key={k} className={`flex justify-between gap-4 px-3 py-2.5 ${row}`}>
                    <dt className="text-muted-foreground">{k}</dt>
                    <dd className={`font-medium ${isRTL ? "text-left" : "text-right"}`}>{v}</dd>
                  </div>
                ))}
              </dl>
              <DialogFooter className={isRTL ? "sm:flex-row-reverse sm:justify-start" : ""}>
                <Button variant="outline" className="text-destructive hover:text-destructive" onClick={() => { setDeleting(viewing); setViewing(null); }}>
                  <Trash2 className="h-4 w-4" /> {t("delete")}
                </Button>
                <Button onClick={() => openEdit(viewing)}>
                  <Pencil className="h-4 w-4" /> {t("edit")}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit */}
      <Dialog open={!!editing} onOpenChange={(v) => !v && setEditing(null)}>
        <DialogContent className={`sm:max-w-md ${isRTL ? "font-urdu text-right" : ""}`}>
          <DialogHeader>
            <DialogTitle>{editing?.kind === "payment" ? t("editPayment") : t("editReceipt")}</DialogTitle>
            <DialogDescription className="font-mono">{editing?.voucherNo}</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (editing && !editInvalid) updateMutation.mutate({ entry: editing, form: editForm });
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="cash-edit-date">{t("date")}</Label>
                <Input id="cash-edit-date" type="date" required value={editForm.date} onChange={(ev) => setEditForm((s) => ({ ...s, date: ev.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cash-edit-amount">{t("amount")} (Rs.)</Label>
                <Input
                  id="cash-edit-amount"
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min="0.01"
                  required
                  className="tabular-nums"
                  value={editForm.amount}
                  onChange={(ev) => setEditForm((s) => ({ ...s, amount: ev.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cash-edit-party">{editing?.kind === "payment" ? t("paidTo") : t("receivedFrom")}</Label>
              <Input id="cash-edit-party" required value={editForm.party} onChange={(ev) => setEditForm((s) => ({ ...s, party: ev.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cash-edit-description">{t("description")}</Label>
              <Textarea id="cash-edit-description" rows={3} value={editForm.description} onChange={(ev) => setEditForm((s) => ({ ...s, description: ev.target.value }))} />
            </div>
            <DialogFooter className={isRTL ? "sm:flex-row-reverse sm:justify-start" : ""}>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={editInvalid || updateMutation.isPending}>
                {updateMutation.isPending ? t("saving") : t("saveChanges")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Opening balance */}
      <Dialog open={openingOpen} onOpenChange={setOpeningOpen}>
        <DialogContent className={`sm:max-w-md ${isRTL ? "font-urdu text-right" : ""}`}>
          <DialogHeader>
            <DialogTitle>{t("setOpeningBalance")}</DialogTitle>
            <DialogDescription>
              The cash on hand before any receipt or payment was recorded. Every balance in this module is measured
              from this figure.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(ev) => {
              ev.preventDefault();
              if (!openingInvalid) openingMutation.mutate(String(parseAmount(openingForm)));
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="cash-opening-balance">{t("openingBalance")} (Rs.)</Label>
              <Input
                id="cash-opening-balance"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                required
                autoFocus
                className="tabular-nums"
                value={openingForm}
                onChange={(ev) => setOpeningForm(ev.target.value)}
              />
            </div>
            <DialogFooter className={isRTL ? "sm:flex-row-reverse sm:justify-start" : ""}>
              <Button type="button" variant="outline" onClick={() => setOpeningOpen(false)}>
                {t("cancel")}
              </Button>
              <Button type="submit" disabled={openingInvalid || openingMutation.isPending}>
                {openingMutation.isPending ? t("saving") : t("save")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && !deleteMutation.isPending && setDeleting(null)}>
        <AlertDialogContent className={isRTL ? "font-urdu text-right" : ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleting?.kind === "payment" ? t("deletePaymentQ") : t("deleteReceiptQ")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteCashHint").replace("{v}", deleting?.voucherNo ?? "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isRTL ? "sm:flex-row-reverse sm:justify-start" : ""}>
            <AlertDialogCancel disabled={deleteMutation.isPending}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
              onClick={(ev) => {
                // Keep the dialog open until the delete settles so errors stay visible in context.
                ev.preventDefault();
                if (deleting) deleteMutation.mutate(deleting);
              }}
            >
              {deleteMutation.isPending ? t("deleting") : t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
