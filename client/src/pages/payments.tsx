import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Calculator, Eye, Trash2, ArrowLeft, Plus, Pencil, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account } from "@/types/schema";
import { format } from "date-fns";

const lineSchema = z.object({
  accountId: z.string().optional(),
  narration: z.string().optional(),
  amount: z.string().default("0"),
});

const paymentFormSchema = z.object({
  voucherType: z.literal("DR").default("DR"),
  voucherNumber: z.string().optional(),
  voucherDate: z.string().default(new Date().toISOString().slice(0, 10)),
  narration: z.string().optional(),
  lines: z.array(lineSchema).min(1, "At least one line is required"),
});

type PaymentFormData = z.infer<typeof paymentFormSchema>;
type Payment = {
  id: number;
  voucherNumber: string;
  voucherType: string;
  voucherDate: string;
  totalDebit: string;
  totalCredit: string;
  amountInWords: string;
  narration?: string;
  primaryAccountName?: string;
  lines?: { id: number; accountId: number; narration?: string; debit: string; credit: string }[];
};

function numberToWords(num: number) {
  const belowTwenty = ["zero","one","two","three","four","five","six","seven","eight","nine","ten","eleven","twelve","thirteen","fourteen","fifteen","sixteen","seventeen","eighteen","nineteen"];
  const tens = ["","","twenty","thirty","forty","fifty","sixty","seventy","eighty","ninety"];
  const scales = ["","thousand","million","billion"];
  if (!Number.isFinite(num)) return "";
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

export default function PaymentsPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const [location] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewId, setViewId] = useState<number | null>(null);
  const isReadOnly = viewId !== null;
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consumedEditId = useRef<number | null>(null);

  const buildDefaults = (): PaymentFormData => ({
    voucherType: "DR",
    voucherDate: new Date().toISOString().slice(0, 10),
    voucherNumber: "",
    narration: "",
    lines: [{ accountId: "", narration: "", amount: "0" }],
  });

  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentFormSchema),
    defaultValues: buildDefaults(),
  });

  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" });
  const lines = useWatch({ control: form.control, name: "lines" }) || [];

  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: payments = [], isLoading } = useQuery<Payment[]>({ queryKey: ["/api/payments"] });
  const filteredPayments = useMemo(
    () => payments.filter((p) => p.voucherType === "DR"),
    [payments]
  );

  const fetchNextNumber = useCallback(async () => {
    if (editingId || viewId) {
      return form.getValues("voucherNumber") || "";
    }
    try {
      const res = await apiRequest("GET", `/api/payments/next-number`);
      const json = await res.json();
      form.setValue("voucherNumber", json.voucherNumber, { shouldDirty: true });
      return json.voucherNumber as string;
    } catch (err) {
      console.error(err);
      return "";
    }
  }, [form, editingId, viewId]);

  useEffect(() => {
    if (isDialogOpen && !editingId && !viewId) {
      fetchNextNumber();
    }
  }, [isDialogOpen, editingId, viewId, fetchNextNumber]);

  useEffect(() => {
    if (!isDialogOpen) {
      if (closeTimer.current) { clearTimeout(closeTimer.current); }
      closeTimer.current = setTimeout(() => {
        setEditingId(null);
        setViewId(null);
        form.reset(buildDefaults());
      }, 200);
    } else if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    return () => {
      if (closeTimer.current) {
        clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [isDialogOpen]);

  const normalizeLines = (data: PaymentFormData) =>
    (data.lines || [])
      .filter((l) => l.accountId && parseFloat(l.amount || "0") > 0)
      .map((l) => {
        const amt = l.amount || "0";
        return {
          accountId: parseInt(l.accountId ?? "0"),
          narration: l.narration,
          debit: amt,
          credit: "0",
        };
      });

  const createMutation = useMutation({
    mutationFn: (data: PaymentFormData) => apiRequest("POST", "/api/payments", {
      ...data,
      voucherDate: data.voucherDate || undefined,
      lines: normalizeLines(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsDialogOpen(false);
      setEditingId(null);
      setViewId(null);
      toast({ title: t("savedSuccessfully") });
    },
    onError: async (err: any) => {
      const msg = await err?.json?.()?.error || err?.message || "Failed to save";
      toast({ title: "Save failed", description: String(msg), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: PaymentFormData }) => apiRequest("PATCH", `/api/payments/${id}`, {
      ...data,
      voucherDate: data.voucherDate || undefined,
      lines: normalizeLines(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsDialogOpen(false);
      setEditingId(null);
      setViewId(null);
      toast({ title: t("savedSuccessfully") });
    },
    onError: async (err: any) => {
      const msg = await err?.json?.()?.error || err?.message || "Failed to save";
      toast({ title: "Save failed", description: String(msg), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/payments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/payments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      toast({ title: "Deleted" });
    },
  });

  const loadVoucher = async (id: number) => {
    const res = await apiRequest("GET", `/api/payments/${id}`);
    const voucher: Payment = await res.json();
    const lineAmount = (l: { debit?: string; credit?: string }) => {
      const debit = parseFloat(l.debit || "0");
      const credit = parseFloat(l.credit || "0");
      return debit > 0 ? l.debit : credit > 0 ? l.credit : "0";
    };
    // Exclude settlement lines (auto-generated); including them would double the amount on save
    const paymentLines = (voucher.lines || []).filter(
      (l: { narration?: string }) => !(l.narration || "").toLowerCase().includes("settlement")
    );
    form.reset({
      voucherType: "DR",
      voucherNumber: voucher.voucherNumber,
      voucherDate: new Date(voucher.voucherDate).toISOString().slice(0, 10),
      narration: voucher.narration || "",
      lines: paymentLines.map((l: { accountId: number; narration?: string; debit?: string; credit?: string }) => ({
        accountId: l.accountId.toString(),
        narration: l.narration || "",
        amount: lineAmount(l),
      })),
    });
    setIsDialogOpen(true);
  };

  const handleEdit = async (id: number) => {
    try {
      setEditingId(id);
      setViewId(null);
      await loadVoucher(id);
    } catch (err: any) {
      toast({ title: "Failed to load voucher", description: err?.message, variant: "destructive" });
    }
  };

  const handleView = async (id: number) => {
    try {
      setEditingId(null);
      setViewId(id);
      await loadVoucher(id);
    } catch (err: any) {
      toast({ title: "Failed to load voucher", description: err?.message, variant: "destructive" });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] || "");
    const editParam = params.get("editId");
    if (!editParam) return;
    const id = Number(editParam);
    if (!Number.isFinite(id) || consumedEditId.current === id) return;
    consumedEditId.current = id;
    handleEdit(id);
  }, [location]);

  const handleSubmit = async (data: PaymentFormData) => {
    if (isReadOnly) {
      setIsDialogOpen(false);
      setViewId(null);
      return;
    }
    if (activeLines.length === 0) {
      toast({ title: "Add at least one line with an account and amount", variant: "destructive" });
      return;
    }
    if (totalAmount === 0) {
      toast({ title: "Amount must be greater than 0", variant: "destructive" });
      return;
    }
    if (!data.voucherNumber) {
      await fetchNextNumber();
    }

    const payload: PaymentFormData = {
      ...data,
      voucherType: "DR",
      lines: activeLines.map((l) => ({
        ...l,
        accountId: l.accountId as string,
      })),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const activeLines = useMemo(
    () =>
      lines.filter(
        (l) =>
          l.accountId &&
          (parseFloat(l.amount || "0") > 0)
      ),
    [lines]
  );
  const totalAmount = useMemo(
    () => activeLines.reduce((sum, l) => sum + (parseFloat(l.amount || "0") || 0), 0),
    [activeLines]
  );
  const displayDebit = totalAmount;
  const amountWords = useMemo(
    () => numberToWords(Math.round(totalAmount)) + " only",
    [totalAmount]
  );

  const startNew = () => {
    setEditingId(null);
    setViewId(null);
    form.reset(buildDefaults());
    setIsDialogOpen(true);
    fetchNextNumber();
  };

  const accountTitleForRow = (p: Payment) => {
    if (p.primaryAccountName) return p.primaryAccountName;
    const firstLineAccId = p.lines?.[0]?.accountId;
    return accounts.find((a) => a.id === firstLineAccId)?.name || "";
  };

  const amountTitle = t("total") || "Amount";
  const dialogTitle = viewId ? "View Cash Payment" : editingId ? "Edit Cash Payment" : "New Cash Payment";

  const columns: Column<Payment>[] = [
    { key: "voucherNumber", title: t("voucherNumber"), render: (p) => <span className="font-mono text-sm">{p.voucherNumber}</span> },
    { key: "voucherDate", title: t("voucherDate"), render: (p) => format(new Date(p.voucherDate), "dd MMM yyyy") },
    { key: "account", title: t("account"), render: (p) => <span>{accountTitleForRow(p) || "-"}</span> },
    { key: "amount", title: amountTitle, align: "right", render: (p) => {
      const debit = parseFloat(p.totalDebit || "0");
      const fallback = (p.lines || []).reduce((sum, l) => sum + parseFloat(l.debit || l.credit || "0"), 0);
      const amt = debit || fallback;
      return <span className="font-mono">{amt.toLocaleString()}</span>;
    } },
    { key: "actions", title: t("actions"), render: (p) => (
      <div className="flex gap-2">
        <Button size="icon" variant="ghost" onClick={() => handleView(p.id)}><Eye className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => handleEdit(p.id)}><Pencil className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(p.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    ) },
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("cashPayments")}</h1>
            <p className="text-sm text-muted-foreground">Cash Payment (debit only)</p>
          </div>
        </div>
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" /> {t("add")}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <DataTable columns={columns} data={filteredPayments} isLoading={isLoading} testIdPrefix="payments" />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          setEditingId(null);
          setViewId(null);
        }
      }}>
        <DialogContent className="sm:max-w-5xl w-[100vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setIsDialogOpen(false)} aria-label="Back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>{dialogTitle}</DialogTitle>
              </div>
              <div className="flex items-center gap-2">
                {isReadOnly && viewId && (
                  <PrintActions
                    docKey={docKeys.cashPaymentVoucher}
                    params={{ voucherId: viewId }}
                    title="Cash Payment Voucher"
                  />
                )}
                {!isReadOnly && <Button variant="ghost" onClick={startNew}>Clear</Button>}
              </div>
            </div>
            <DialogDescription className="sr-only">
              Cash payment voucher details
            </DialogDescription>
          </DialogHeader>
          {isReadOnly ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">{t("voucherDate")}</p>
                  <p className="font-medium">{format(new Date(form.watch("voucherDate")), "dd MMM yyyy")}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("voucherNumber")}</p>
                  <p className="font-mono">{form.watch("voucherNumber") || "Лил"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t("voucherType")}</p>
                  <p className="font-medium">DR</p>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Detail</p>
                <p className="rounded-md border bg-muted/40 p-3 min-h-[72px] whitespace-pre-wrap">
                  {form.watch("narration") || "Лил"}
                </p>
              </div>
              <div className="space-y-3">
                <h3 className="font-semibold">Lines</h3>
                {fields.map((field, idx) => {
                  const accountId = form.watch(`lines.${idx}.accountId`);
                  const accountSelected = accounts.find(a => a.id.toString() === accountId);
                  const accountTitle = accountSelected ? `${accountSelected.name} (${accountSelected.type})` : "";
                  const narration = form.watch(`lines.${idx}.narration`);
                  const amount = form.watch(`lines.${idx}.amount`);
                  return (
                    <div key={field.id} className="rounded-md border bg-muted/30 p-3 space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Paid To</span>
                        <span className="font-medium">{accountTitle || "Лил"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("narration")}</span>
                        <span>{narration || "Лил"}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t("debit")}</span>
                        <span className="font-mono">{parseFloat(amount || "0").toLocaleString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="rounded-md border bg-muted/40 p-4 space-y-1 text-sm">
                <div className="flex items-center gap-2">
                  <span>{t("debit")}:</span>
                  <span className="font-mono">{displayDebit.toLocaleString()}</span>
                </div>
                <div className="text-xs text-muted-foreground">{t("amountInWords")}: {amountWords}</div>
              </div>
            </div>
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
                <div className="grid grid-cols-4 gap-4">
                  <FormField
                    control={form.control}
                    name="voucherDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("voucherDate")}</FormLabel>
                        <FormControl><Input type="date" {...field} /></FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="voucherNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("voucherNumber")}</FormLabel>
                        <FormControl><Input {...field} readOnly placeholder="Auto" /></FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="voucherType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("voucherType")}</FormLabel>
                        <Input readOnly value="DR" />
                        <input type="hidden" {...field} />
                      </FormItem>
                    )}
                  />
                </div>
                <FormField
                  control={form.control}
                  name="narration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Detail</FormLabel>
                      <FormControl>
                        <Textarea rows={2} placeholder="Add details" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium">Lines</h3>
                    <div className="flex gap-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => append({ accountId: "", narration: "", amount: "0" })}>
                        <Plus className="h-4 w-4" /> Add line
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {fields.map((field, idx) => {
                      const accountId = form.watch(`lines.${idx}.accountId`);
                      const accountSelected = accounts.find(a => a.id.toString() === accountId);
                      const accountTitle = accountSelected ? `${accountSelected.name} (${accountSelected.type})` : "";
                      return (
                        <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`lines.${idx}.accountId`}
                              render={({ field }) => (
                                <FormItem>
                                  {idx === 0 && <FormLabel>Paid To</FormLabel>}
                                  <Select value={field.value} onValueChange={field.onChange}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue placeholder="Select account" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {accounts.map((a) => (
                                        <SelectItem key={a.id} value={a.id.toString()}>
                                          {a.name} ({a.type})
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-2">
                            {idx === 0 && <FormLabel>Title</FormLabel>}
                            <Input value={accountTitle} readOnly />
                          </div>
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`lines.${idx}.narration`}
                              render={({ field }) => (
                                <FormItem>
                                  {idx === 0 && <FormLabel>{t("narration")}</FormLabel>}
                                  <FormControl><Input {...field} /></FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-2">
                            <FormField
                              control={form.control}
                              name={`lines.${idx}.amount`}
                              render={({ field }) => (
                                <FormItem>
                                  {idx === 0 && <FormLabel>{t("debit")}</FormLabel>}
                                  <FormControl>
                                    <Input type="number" step="0.01" {...field} />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-2 flex items-end justify-end">
                            {fields.length > 1 && (
                              <Button type="button" size="icon" variant="ghost" onClick={() => remove(idx)} aria-label="Remove line">
                                <Minus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Card className="bg-muted/40">
                  <CardContent className="pt-4 grid grid-cols-2 gap-4">
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span>{t("debit")}</span><span className="font-mono">{displayDebit.toLocaleString()}</span></div>
                      <div className="text-xs text-muted-foreground">{t("amountInWords")}: {amountWords}</div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Button type="submit" disabled={totalAmount === 0 || createMutation.isPending || updateMutation.isPending}>
                        <Calculator className="h-4 w-4" />
                        {editingId ? "Update" : t("save")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
