import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CashBalanceCard } from "@/components/Cash/CashBalanceCard";
import { CashReceiptForm } from "@/components/Cash/CashReceiptForm";
import { CashPaymentForm } from "@/components/Cash/CashPaymentForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/language-context";
import { Plus, FileText } from "lucide-react";
import { Link } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deletePayment,
  deleteReceipt,
  getPayments,
  getReceipts,
  updatePayment,
  updateReceipt,
} from "@/api/cash.api";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";

type CashReceiptRow = {
  id: number;
  voucherNo: string;
  receiptDate: string | number;
  receivedFrom: string;
  amount: string;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
  invoiceRef?: string;
};

type CashPaymentRow = {
  id: number;
  voucherNo: string;
  paymentDate: string | number;
  paidTo: string;
  amount: string;
  description?: string | null;
  referenceType?: string | null;
  referenceId?: number | null;
  invoiceRef?: string;
};

function parseAmount(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const n = parseFloat(value);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function formatDateSafe(value: unknown): string {
  if (typeof value === "number") {
    const ms = Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? "-" : format(d, "dd MMM yyyy");
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") {
      const ms = Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return format(d, "dd MMM yyyy");
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "-" : format(d, "dd MMM yyyy");
  }
  return "-";
}

function toInputDate(value: unknown): string {
  if (typeof value === "number") {
    const ms = Math.abs(value) < 1_000_000_000_000 ? value * 1000 : value;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && value.trim() !== "") {
      const ms = Math.abs(numeric) < 1_000_000_000_000 ? numeric * 1000 : numeric;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    }
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  return new Date().toISOString().slice(0, 10);
}

export default function CashDashboardPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [viewReceipt, setViewReceipt] = useState<CashReceiptRow | null>(null);
  const [viewPayment, setViewPayment] = useState<CashPaymentRow | null>(null);
  const [editReceipt, setEditReceipt] = useState<CashReceiptRow | null>(null);
  const [editPayment, setEditPayment] = useState<CashPaymentRow | null>(null);
  const [deleteReceiptRow, setDeleteReceiptRow] = useState<CashReceiptRow | null>(null);
  const [deletePaymentRow, setDeletePaymentRow] = useState<CashPaymentRow | null>(null);
  const [editReceiptForm, setEditReceiptForm] = useState({
    receiptDate: "",
    receivedFrom: "",
    amount: "",
    description: "",
  });
  const [editPaymentForm, setEditPaymentForm] = useState({
    paymentDate: "",
    paidTo: "",
    amount: "",
    description: "",
  });

  const { data: receiptsData, isLoading: receiptsLoading, isError: receiptsError } = useQuery<CashReceiptRow[]>({
    queryKey: ["/api/cash/receipts"],
    queryFn: () => getReceipts(),
  });

  const { data: paymentsData, isLoading: paymentsLoading, isError: paymentsError } = useQuery<CashPaymentRow[]>({
    queryKey: ["/api/cash/payments"],
    queryFn: () => getPayments(),
  });
  const receipts = Array.isArray(receiptsData) ? receiptsData : [];
  const payments = Array.isArray(paymentsData) ? paymentsData : [];

  const invalidateCashQueries = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["/api/cash/summary"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/cash/receipts"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/cash/payments"] }),
      queryClient.invalidateQueries({ queryKey: ["/api/cash/ledger"] }),
    ]);
  };

  const updateReceiptMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { receiptDate: string; receivedFrom: string; amount: string; description?: string } }) =>
      updateReceipt(id, data),
    onSuccess: async () => {
      await invalidateCashQueries();
      setEditReceipt(null);
      toast({ title: "Receipt updated successfully" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update receipt";
      toast({ title: message, variant: "destructive" });
    },
  });

  const updatePaymentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { paymentDate: string; paidTo: string; amount: string; description?: string } }) =>
      updatePayment(id, data),
    onSuccess: async () => {
      await invalidateCashQueries();
      setEditPayment(null);
      toast({ title: "Payment updated successfully" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to update payment";
      toast({ title: message, variant: "destructive" });
    },
  });

  const deleteReceiptMutation = useMutation({
    mutationFn: (id: number) => deleteReceipt(id),
    onSuccess: async () => {
      await invalidateCashQueries();
      setDeleteReceiptRow(null);
      toast({ title: "Receipt deleted successfully" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to delete receipt";
      toast({ title: message, variant: "destructive" });
    },
  });

  const deletePaymentMutation = useMutation({
    mutationFn: (id: number) => deletePayment(id),
    onSuccess: async () => {
      await invalidateCashQueries();
      setDeletePaymentRow(null);
      toast({ title: "Payment deleted successfully" });
    },
    onError: (err: unknown) => {
      const message = err instanceof Error ? err.message : "Failed to delete payment";
      toast({ title: message, variant: "destructive" });
    },
  });

  const openEditReceipt = (row: CashReceiptRow) => {
    setEditReceipt(row);
    setEditReceiptForm({
      receiptDate: toInputDate(row.receiptDate),
      receivedFrom: row.receivedFrom ?? "",
      amount: String(parseAmount(row.amount)),
      description: row.description ?? "",
    });
  };

  const openEditPayment = (row: CashPaymentRow) => {
    setEditPayment(row);
    setEditPaymentForm({
      paymentDate: toInputDate(row.paymentDate),
      paidTo: row.paidTo ?? "",
      amount: String(parseAmount(row.amount)),
      description: row.description ?? "",
    });
  };

  const submitEditReceipt = () => {
    if (!editReceipt) return;
    const amount = parseAmount(editReceiptForm.amount);
    if (!editReceiptForm.receiptDate || !editReceiptForm.receivedFrom.trim() || amount <= 0) {
      toast({ title: "Please fill valid receipt fields", variant: "destructive" });
      return;
    }
    updateReceiptMutation.mutate({
      id: editReceipt.id,
      data: {
        receiptDate: editReceiptForm.receiptDate,
        receivedFrom: editReceiptForm.receivedFrom.trim(),
        amount: String(amount),
        description: editReceiptForm.description.trim() || undefined,
      },
    });
  };

  const submitEditPayment = () => {
    if (!editPayment) return;
    const amount = parseAmount(editPaymentForm.amount);
    if (!editPaymentForm.paymentDate || !editPaymentForm.paidTo.trim() || amount <= 0) {
      toast({ title: "Please fill valid payment fields", variant: "destructive" });
      return;
    }
    updatePaymentMutation.mutate({
      id: editPayment.id,
      data: {
        paymentDate: editPaymentForm.paymentDate,
        paidTo: editPaymentForm.paidTo.trim(),
        amount: String(amount),
        description: editPaymentForm.description.trim() || undefined,
      },
    });
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("cashInHand")}</h1>
          <p className="text-sm text-muted-foreground">
            Cash receipts, payments, and journal vouchers with real-time balance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setReceiptOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Receipt
          </Button>
          <Button variant="outline" onClick={() => setPaymentOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Payment
          </Button>
          <Link href="/journal">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" /> Journal Voucher
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <CashBalanceCard variant="opening" />
        <CashBalanceCard variant="receipts" />
        <CashBalanceCard variant="payments" />
        <CashBalanceCard variant="balance" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Receipts</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Date</th>
                    <th className="p-3 text-left font-medium">Voucher</th>
                    <th className="p-3 text-left font-medium">Received From</th>
                    <th className="p-3 text-right font-medium">Amount</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptsLoading ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">Loading receipts...</td>
                    </tr>
                  ) : receiptsError ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-destructive">Failed to load receipts</td>
                    </tr>
                  ) : receipts.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">No receipts yet</td>
                    </tr>
                  ) : (
                    receipts.slice(0, 10).map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="p-3">{formatDateSafe(r.receiptDate)}</td>
                        <td className="p-3 font-mono text-xs">{r.voucherNo}</td>
                        <td className="p-3">{r.receivedFrom}</td>
                        <td className="p-3 text-right font-mono">Rs. {parseAmount(r.amount).toLocaleString()}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setViewReceipt(r)}>View</Button>
                            <Button size="sm" variant="outline" onClick={() => openEditReceipt(r)}>Edit</Button>
                            <Button size="sm" variant="destructive" onClick={() => setDeleteReceiptRow(r)}>Delete</Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent Payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="p-3 text-left font-medium">Date</th>
                    <th className="p-3 text-left font-medium">Voucher</th>
                    <th className="p-3 text-left font-medium">Paid To</th>
                    <th className="p-3 text-right font-medium">Amount</th>
                    <th className="p-3 text-right font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {paymentsLoading ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">Loading payments...</td>
                    </tr>
                  ) : paymentsError ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-destructive">Failed to load payments</td>
                    </tr>
                  ) : payments.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="p-6 text-center text-muted-foreground">No payments yet</td>
                    </tr>
                  ) : (
                    payments.slice(0, 10).map((p) => (
                      <tr key={p.id} className="border-b">
                        <td className="p-3">{formatDateSafe(p.paymentDate)}</td>
                        <td className="p-3 font-mono text-xs">{p.voucherNo}</td>
                        <td className="p-3">{p.paidTo}</td>
                        <td className="p-3 text-right font-mono">Rs. {parseAmount(p.amount).toLocaleString()}</td>
                        <td className="p-3">
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => setViewPayment(p)}>View</Button>
                            <Button size="sm" variant="outline" onClick={() => openEditPayment(p)}>Edit</Button>
                            <Button size="sm" variant="destructive" onClick={() => setDeletePaymentRow(p)}>Delete</Button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      <CashReceiptForm open={receiptOpen} onOpenChange={setReceiptOpen} />
      <CashPaymentForm open={paymentOpen} onOpenChange={setPaymentOpen} />

      <Dialog open={!!viewReceipt} onOpenChange={(v) => !v && setViewReceipt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Receipt Details</DialogTitle>
            <DialogDescription>Voucher {viewReceipt?.voucherNo}</DialogDescription>
          </DialogHeader>
          {viewReceipt && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Date:</span> {formatDateSafe(viewReceipt.receiptDate)}</p>
              <p><span className="font-medium">Received From:</span> {viewReceipt.receivedFrom}</p>
              <p><span className="font-medium">Amount:</span> Rs. {parseAmount(viewReceipt.amount).toLocaleString()}</p>
              <p><span className="font-medium">Reference:</span> {viewReceipt.referenceType ? `${viewReceipt.referenceType}${viewReceipt.referenceId ? ` #${viewReceipt.referenceId}` : ""}` : "Manual"}</p>
              <p><span className="font-medium">Description:</span> {viewReceipt.description || "-"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewPayment} onOpenChange={(v) => !v && setViewPayment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Payment Details</DialogTitle>
            <DialogDescription>Voucher {viewPayment?.voucherNo}</DialogDescription>
          </DialogHeader>
          {viewPayment && (
            <div className="space-y-2 text-sm">
              <p><span className="font-medium">Date:</span> {formatDateSafe(viewPayment.paymentDate)}</p>
              <p><span className="font-medium">Paid To:</span> {viewPayment.paidTo}</p>
              <p><span className="font-medium">Amount:</span> Rs. {parseAmount(viewPayment.amount).toLocaleString()}</p>
              <p><span className="font-medium">Reference:</span> {viewPayment.referenceType ? `${viewPayment.referenceType}${viewPayment.referenceId ? ` #${viewPayment.referenceId}` : ""}` : "Manual"}</p>
              <p><span className="font-medium">Description:</span> {viewPayment.description || "-"}</p>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editReceipt} onOpenChange={(v) => !v && setEditReceipt(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Receipt</DialogTitle>
            <DialogDescription>Update receipt fields and save.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="date" value={editReceiptForm.receiptDate} onChange={(e) => setEditReceiptForm((s) => ({ ...s, receiptDate: e.target.value }))} />
            <Input placeholder="Received From" value={editReceiptForm.receivedFrom} onChange={(e) => setEditReceiptForm((s) => ({ ...s, receivedFrom: e.target.value }))} />
            <Input type="number" step="0.01" min="0" placeholder="Amount" value={editReceiptForm.amount} onChange={(e) => setEditReceiptForm((s) => ({ ...s, amount: e.target.value }))} />
            <Textarea placeholder="Description" value={editReceiptForm.description} onChange={(e) => setEditReceiptForm((s) => ({ ...s, description: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditReceipt(null)}>Cancel</Button>
              <Button onClick={submitEditReceipt} disabled={updateReceiptMutation.isPending}>
                {updateReceiptMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editPayment} onOpenChange={(v) => !v && setEditPayment(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Payment</DialogTitle>
            <DialogDescription>Update payment fields and save.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Input type="date" value={editPaymentForm.paymentDate} onChange={(e) => setEditPaymentForm((s) => ({ ...s, paymentDate: e.target.value }))} />
            <Input placeholder="Paid To" value={editPaymentForm.paidTo} onChange={(e) => setEditPaymentForm((s) => ({ ...s, paidTo: e.target.value }))} />
            <Input type="number" step="0.01" min="0" placeholder="Amount" value={editPaymentForm.amount} onChange={(e) => setEditPaymentForm((s) => ({ ...s, amount: e.target.value }))} />
            <Textarea placeholder="Description" value={editPaymentForm.description} onChange={(e) => setEditPaymentForm((s) => ({ ...s, description: e.target.value }))} />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditPayment(null)}>Cancel</Button>
              <Button onClick={submitEditPayment} disabled={updatePaymentMutation.isPending}>
                {updatePaymentMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteReceiptRow} onOpenChange={(v) => !v && setDeleteReceiptRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Receipt?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Receipt {deleteReceiptRow?.voucherNo} will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteReceiptMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteReceiptRow && deleteReceiptMutation.mutate(deleteReceiptRow.id)}
              disabled={deleteReceiptMutation.isPending}
            >
              {deleteReceiptMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deletePaymentRow} onOpenChange={(v) => !v && setDeletePaymentRow(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Payment?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. Payment {deletePaymentRow?.voucherNo} will be permanently deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePaymentMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletePaymentRow && deletePaymentMutation.mutate(deletePaymentRow.id)}
              disabled={deletePaymentMutation.isPending}
            >
              {deletePaymentMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
