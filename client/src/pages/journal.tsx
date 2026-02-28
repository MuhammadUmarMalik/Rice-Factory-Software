import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DataTable, type Column } from "@/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { Eye, Pencil, CheckCircle, Loader2, Plus, Trash2, X } from "lucide-react";
import type { Account } from "@/types/schema";
import { useLanguage } from "@/contexts/language-context";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { useAuthStore } from "@/stores/auth.store";

const journalFormSchema = z
  .object({
    voucherNo: z.string().optional(),
    voucherDate: z.string().min(1, "Voucher date is required"),
    debitAccountId: z.string().min(1, "Select debit account"),
    creditAccountId: z.string().min(1, "Select credit account"),
    amount: z.string().min(1, "Amount is required"),
    narration: z.string().optional(),
    status: z.enum(["draft", "approved"]).default("draft"),
  })
  .superRefine((data, ctx) => {
    const amount = parseFloat(data.amount || "0");
    if (!Number.isFinite(amount) || amount <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Amount must be greater than 0" });
    }
  });

type JournalFormData = z.infer<typeof journalFormSchema>;
type JournalVoucherRow = {
  id: number;
  voucherNo: string;
  voucherDate: string | number | Date;
  status: "draft" | "approved";
  totalAmount: string;
  amountInWords?: string;
  narration?: string;
  entries: { id: number; accountId: number; entryType: "DEBIT" | "CREDIT"; amount: string }[];
  debitAccountName?: string;
  creditAccountName?: string;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function numberToWords(num: number) {
  const belowTwenty = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const scales = ["","thousand","million","billion"];
  if (!Number.isFinite(num) || num < 0) return "";
  if (num === 0) return "zero";
  const chunk = (n: number) => {
    let word = "";
    if (n >= 100) {
      word += `${belowTwenty[Math.floor(n / 100)]} hundred`;
      n %= 100;
      if (n) word += " ";
    }
    if (n >= 20) {
      word += tens[Math.floor(n / 10)];
      n %= 10;
      if (n) word += `-${belowTwenty[n]}`;
    } else if (n > 0) {
      word += belowTwenty[n];
    }
    return word;
  };
  const parts: string[] = [];
  let remaining = Math.floor(num);
  let idx = 0;
  while (remaining > 0) {
    const c = remaining % 1000;
    if (c) {
      const prefix = chunk(c);
      const suffix = scales[idx];
      parts.unshift(suffix ? `${prefix} ${suffix}` : prefix);
    }
    remaining = Math.floor(remaining / 1000);
    idx += 1;
  }
  return parts.join(" ");
}

function formatDate(value: string | number | Date) {
  try {
    return format(new Date(value), "dd MMM yyyy");
  } catch {
    return "";
  }
}

function currency(val: number) {
  if (!Number.isFinite(val)) return "0.00";
  return val.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function JournalVoucherPage() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [isViewing, setIsViewing] = useState(false);
  const [search, setSearch] = useState("");
  const role = useAuthStore((state) => state.user?.role || "operator");
  const canApprove = ["admin", "manager"].includes(role);
  const canEditDraft = ["admin", "manager", "accountant"].includes(role);
  const canEditApproved = ["admin", "manager", "accountant"].includes(role);
  const canDeleteVoucher = ["admin", "manager"].includes(role);

  const form = useForm<JournalFormData>({
    resolver: zodResolver(journalFormSchema),
    defaultValues: {
      voucherNo: "",
      voucherDate: todayISO(),
      debitAccountId: "",
      creditAccountId: "",
      amount: "",
      narration: "",
      status: "draft",
    },
  });

  const amountValue = parseFloat(form.watch("amount") || "0");
  const totalAmount = useMemo(() => (Number.isFinite(amountValue) ? amountValue : 0), [amountValue]);
  const debitAmount = totalAmount;
  const creditAmount = totalAmount;
  const amountInWords = totalAmount > 0 ? `${numberToWords(totalAmount)} only` : "";

  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: vouchers = [], isLoading } = useQuery<JournalVoucherRow[]>({ queryKey: ["/api/journal-vouchers"] });

  const filtered = useMemo(() => {
    if (!search) return vouchers;
    return vouchers.filter((v) => {
      const haystack = `${v.voucherNo} ${v.debitAccountName || ""} ${v.creditAccountName || ""} ${v.narration || ""}`.toLowerCase();
      return haystack.includes(search.toLowerCase());
    });
  }, [vouchers, search]);

  const fetchNextNo = async () => {
    try {
      const res = await apiRequest("GET", "/api/journal-vouchers/next-number");
      const json = await res.json();
      form.setValue("voucherNo", json.voucherNo || json.voucher_no || json.voucherNo, { shouldDirty: true });
    } catch (err) {
      console.error(err);
    }
  };

  const resetForm = () => {
    setActiveId(null);
    setIsViewing(false);
    form.reset({
      voucherNo: "",
      voucherDate: todayISO(),
      debitAccountId: "",
      creditAccountId: "",
      amount: "",
      narration: "",
      status: "draft",
    });
    fetchNextNo();
  };

  useEffect(() => {
    if (!dialogOpen) return;
    fetchNextNo();
  }, [dialogOpen]);

  const buildPayload = (data: JournalFormData) => ({
    voucherDate: data.voucherDate,
    narration: data.narration,
    status: data.status,
    debitAccountId: parseInt(data.debitAccountId),
    debitAmount: data.amount,
    creditAccountId: parseInt(data.creditAccountId),
    creditAmount: data.amount,
  });

  const createMutation = useMutation({
    mutationFn: async (data: JournalFormData) => {
      const res = await apiRequest("POST", "/api/journal-vouchers", buildPayload(data));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Journal voucher saved" });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/payrolls"),
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Save failed", description: err.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: JournalFormData }) => {
      const res = await apiRequest("PATCH", `/api/journal-vouchers/${id}`, buildPayload(data));
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Journal voucher updated" });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/payrolls"),
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Update failed", description: err.message, variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest("POST", `/api/journal-vouchers/${id}/approve`, { approvedBy: undefined });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Voucher approved" });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/payrolls"),
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Approve failed", description: err.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/journal-vouchers/${id}`),
    onSuccess: () => {
      toast({ title: "Voucher deleted" });
      queryClient.invalidateQueries({ queryKey: ["/api/journal-vouchers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({
        predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/payrolls"),
      });
      setDialogOpen(false);
      resetForm();
    },
    onError: (err: Error) => toast({ title: "Delete failed", description: err.message, variant: "destructive" }),
  });

  const onSubmit = (values: JournalFormData) => {
    if (activeId) {
      updateMutation.mutate({ id: activeId, data: values });
    } else {
      createMutation.mutate(values);
    }
  };

  const applyVoucherToForm = (voucher: JournalVoucherRow, lockView = false) => {
    const debit = voucher.entries.find((e) => e.entryType === "DEBIT");
    const credit = voucher.entries.find((e) => e.entryType === "CREDIT");
    const voucherAmount = debit?.amount || credit?.amount || voucher.totalAmount || "";
    form.reset({
      voucherNo: voucher.voucherNo,
      voucherDate: format(new Date(voucher.voucherDate), "yyyy-MM-dd"),
      debitAccountId: debit ? String(debit.accountId) : "",
      creditAccountId: credit ? String(credit.accountId) : "",
      amount: voucherAmount || "",
      narration: voucher.narration || "",
      status: voucher.status,
    });
    setActiveId(voucher.id);
    setIsViewing(lockView);
    setDialogOpen(true);
  };

  const startNew = () => {
    resetForm();
    setDialogOpen(true);
  };

  const columns: Column<JournalVoucherRow>[] = [
    { key: "voucherNo", title: "Voucher #", render: (r) => <span className="font-mono text-sm">{r.voucherNo}</span> },
    { key: "voucherDate", title: "Date", render: (r) => formatDate(r.voucherDate) },
    { key: "debitAccount", title: "Debit A/C", render: (r) => r.debitAccountName || "—" },
    { key: "creditAccount", title: "Credit A/C", render: (r) => r.creditAccountName || "—" },
    { key: "amount", title: "Amount", align: "right", render: (r) => `Rs. ${currency(parseFloat(r.totalAmount || "0"))}` },
    {
      key: "status",
      title: "Status",
      render: (r) => (
        <Badge variant={r.status === "approved" ? "default" : "secondary"} className="uppercase">
          {r.status}
        </Badge>
      ),
    },
    {
      key: "actions",
      title: t("actions"),
      render: (r) => (
        <div className="flex gap-2">
          <Button size="icon" variant="ghost" onClick={() => applyVoucherToForm(r, true)} title="View">
            <Eye className="h-4 w-4" />
          </Button>
          {((r.status === "draft" && canEditDraft) || (r.status === "approved" && canEditApproved)) && (
            <Button size="icon" variant="ghost" onClick={() => applyVoucherToForm(r)} title="Edit">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {canDeleteVoucher && (r.status === "draft" || r.status === "approved") && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                const ok = confirm(
                  r.status === "approved"
                    ? "Delete this approved journal voucher? This will remove its ledger impact."
                    : "Delete this journal voucher?",
                );
                if (ok) deleteMutation.mutate(r.id);
              }}
              title="Delete"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
          {r.status === "draft" && canApprove && (
            <Button
              size="icon"
              variant="ghost"
              onClick={() => approveMutation.mutate(r.id)}
              title="Approve"
            >
              <CheckCircle className="h-4 w-4" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  const isApproved = form.watch("status") === "approved";
  const canEditCurrent = activeId
    ? isApproved
      ? canEditApproved
      : canEditDraft
    : canEditDraft;
  const isLocked = isViewing || !canEditCurrent;
  const submitDisabled = isLocked;
  const readOnlyInputClass = "bg-muted/60 cursor-default focus-visible:ring-0 focus-visible:ring-offset-0 text-muted-foreground";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("journalVoucher")}</h1>
          <p className="text-sm text-muted-foreground">
            Balanced journal voucher with auto-numbering, words, and approval control.
          </p>
        </div>
        <Button onClick={startNew} className="shadow-sm">
          <Plus className="h-4 w-4 mr-2" />
          New Voucher
        </Button>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between py-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Recent</p>
            <CardTitle className="text-base font-semibold">Journal Vouchers</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Search voucher, account or narration"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-64"
            />
          </div>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={filtered}
            isLoading={isLoading}
            emptyMessage="No journal vouchers yet"
            testIdPrefix="journal-vouchers"
            searchable={false}
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={(open) => {
        setDialogOpen(open);
        if (!open) {
          resetForm();
        }
      }}>
        <DialogContent className="max-w-5xl w-[100vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader className="pb-2">
            <DialogTitle className="flex items-center justify-between text-xl">
              <span className="font-semibold">Journal Voucher</span>
              <div className="flex items-center gap-2">
                {activeId && (
                  <PrintActions
                    docKey={docKeys.journalVoucher}
                    params={{ voucherId: activeId }}
                    title="Journal Voucher"
                  />
                )}
                <Badge variant={isApproved ? "default" : "secondary"} className="uppercase px-3 py-1 rounded-full">
                  {form.watch("status")}
                </Badge>
              </div>
            </DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <div className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
                <Card className="shadow-sm border-muted">
                  <CardContent className="pt-4 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="voucherNo"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("voucherNumber")}</FormLabel>
                            <FormControl>
                              <Input {...field} readOnly className={readOnlyInputClass} />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="voucherDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("voucherDate")}</FormLabel>
                            <FormControl>
                              <Input
                                type="date"
                                {...field}
                                disabled={isLocked}
                                className={isLocked ? readOnlyInputClass : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <FormField
                        control={form.control}
                        name="debitAccountId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Debit Account</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange} disabled={isLocked}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select debit account" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {accounts.map((acc) => (
                                  <SelectItem key={acc.id} value={String(acc.id)}>
                                    {acc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="creditAccountId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Credit Account</FormLabel>
                            <Select value={field.value} onValueChange={field.onChange} disabled={isLocked}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select credit account" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {accounts.map((acc) => (
                                  <SelectItem key={acc.id} value={String(acc.id)}>
                                    {acc.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <FormField
                        control={form.control}
                        name="amount"
                        render={({ field }) => (
                          <FormItem className="col-span-1">
                            <FormLabel>Amount</FormLabel>
                            <FormControl>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                {...field}
                                disabled={isLocked}
                                className={isLocked ? readOnlyInputClass : ""}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    <FormField
                      control={form.control}
                      name="narration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t("narration")}</FormLabel>
                          <FormControl>
                            <Textarea
                              rows={3}
                              {...field}
                              disabled={isLocked}
                              placeholder="Narration / description"
                              className={isLocked ? readOnlyInputClass : ""}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />

                    <div className="grid grid-cols-3 text-center text-xs uppercase tracking-wide border rounded-md overflow-hidden bg-muted/40">
                      <div className="border-r px-2 py-3 text-muted-foreground">Accountant</div>
                      <div className="border-r px-2 py-3 text-muted-foreground">Manager</div>
                      <div className="px-2 py-3 text-muted-foreground">Partner / Proprietor</div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="shadow-sm bg-muted/30 border-muted">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
                      <span>Amount (Rs)</span>
                      <Plus className="h-4 w-4" />
                    </div>
                    <div className="space-y-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Debit</span>
                        <span className="font-semibold">Rs. {currency(debitAmount || 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-muted-foreground">Credit</span>
                        <span className="font-semibold">Rs. {currency(creditAmount || 0)}</span>
                      </div>
                      <div className="h-px bg-border" />
                      <div className="flex items-center justify-between text-base font-semibold">
                        <span>Total</span>
                        <span>Rs. {currency(totalAmount || 0)}</span>
                      </div>
                      <div className="text-xs text-muted-foreground leading-relaxed">
                        {amountInWords ? `(Rupees ${amountInWords})` : "Enter amounts to see the amount in words"}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="flex flex-wrap items-center gap-3 border-t pt-4">
                {!isViewing && (
                  <>
                    <Button type="submit" disabled={submitDisabled || createMutation.isPending || updateMutation.isPending}>
                      {(createMutation.isPending || updateMutation.isPending) && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {activeId ? (isApproved ? "Update Voucher" : "Update Draft") : "Save Draft"}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={approveMutation.isPending || !activeId || !canApprove || isApproved}
                      onClick={() => activeId && approveMutation.mutate(activeId)}
                    >
                      {approveMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                      {t("approve")}
                    </Button>
                    {activeId && canDeleteVoucher && (
                      <Button
                        type="button"
                        variant="outline"
                        className="text-destructive border-destructive"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          const ok = confirm(
                            isApproved
                              ? "Delete this approved journal voucher? This will remove its ledger impact."
                              : "Delete this journal voucher?",
                          );
                          if (ok) deleteMutation.mutate(activeId);
                        }}
                      >
                        {deleteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Trash2 className="h-4 w-4 mr-2" />}
                        Delete
                      </Button>
                    )}
                  </>
                )}
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                  <X className="h-4 w-4 mr-2" />
                  Close
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
