import { useEffect, useMemo, useState } from "react";
import { Calculator, Eye, Trash2, ArrowLeft, Plus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Account } from "@shared/schema";
import { format } from "date-fns";

const lineSchema = z.object({
  accountId: z.string().optional(),
  narration: z.string().optional(),
  amount: z.string().default("0"),
});

const receiptFormSchema = z.object({
  voucherType: z.enum(["CR", "DR"]).default("CR"),
  voucherNumber: z.string().optional(),
  voucherDate: z.string().default(new Date().toISOString().slice(0, 10)),
  narration: z.string().optional(),
  lines: z.array(lineSchema).min(1, "At least one line is required"),
});

type ReceiptFormData = z.infer<typeof receiptFormSchema>;
type Receipt = {
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

export default function ReceiptsPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [listFilter, setListFilter] = useState<"ALL" | "CR" | "DR">("ALL");

  const buildDefaults = (): ReceiptFormData => ({
    voucherType: "CR",
    voucherDate: new Date().toISOString().slice(0, 10),
    voucherNumber: "",
    narration: "",
    lines: [{ accountId: "", narration: "", amount: "0" }],
  });

  const form = useForm<ReceiptFormData>({
    resolver: zodResolver(receiptFormSchema),
    defaultValues: buildDefaults(),
  });

  const { fields } = useFieldArray({ control: form.control, name: "lines" });
  const lines = useWatch({ control: form.control, name: "lines" }) || [];
  const voucherType = useWatch({ control: form.control, name: "voucherType" }) || "CR";

  const { data: accounts = [] } = useQuery<Account[]>({ queryKey: ["/api/accounts"] });
  const { data: receipts = [], isLoading } = useQuery<Receipt[]>({ queryKey: ["/api/receipts"] });
  const filteredReceipts = useMemo(
    () => receipts.filter((r) => listFilter === "ALL" || r.voucherType === listFilter),
    [receipts, listFilter]
  );

  const fetchNextNumber = async (type?: string) => {
    try {
      const res = await apiRequest("GET", `/api/receipts/next-number?type=${type || form.getValues("voucherType") || "CR"}`);
      const json = await res.json();
      form.setValue("voucherNumber", json.voucherNumber, { shouldDirty: true });
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isDialogOpen && !editingId) {
      fetchNextNumber(form.getValues("voucherType"));
    }
  }, [isDialogOpen, editingId]);

  const normalizeLines = (data: ReceiptFormData) =>
    (data.lines || [])
      .filter((l) => l.accountId && parseFloat(l.amount || "0") > 0)
      .map((l) => {
        const amt = l.amount || "0";
        return {
          accountId: parseInt(l.accountId ?? "0"),
          narration: l.narration,
          debit: amt,
          credit: amt,
        };
      });

  const createMutation = useMutation({
    mutationFn: (data: ReceiptFormData) => apiRequest("POST", "/api/receipts", {
      ...data,
      voucherDate: data.voucherDate || undefined,
      lines: normalizeLines(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      setIsDialogOpen(false);
      setEditingId(null);
      toast({ title: t("savedSuccessfully") });
    },
    onError: async (err: any) => {
      const msg = await err?.json?.()?.error || err?.message || "Failed to save";
      toast({ title: "Save failed", description: String(msg), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReceiptFormData }) => apiRequest("PATCH", `/api/receipts/${id}`, {
      ...data,
      voucherDate: data.voucherDate || undefined,
      lines: normalizeLines(data),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      setIsDialogOpen(false);
      setEditingId(null);
      toast({ title: t("savedSuccessfully") });
    },
    onError: async (err: any) => {
      const msg = await err?.json?.()?.error || err?.message || "Failed to save";
      toast({ title: "Save failed", description: String(msg), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/receipts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/receipts"] });
      toast({ title: "Deleted" });
    },
  });

  const handleEdit = async (id: number) => {
    try {
      const res = await apiRequest("GET", `/api/receipts/${id}`);
      const voucher: Receipt = await res.json();
      setEditingId(id);
      setIsDialogOpen(true);
      form.reset({
        voucherType: voucher.voucherType as any,
        voucherNumber: voucher.voucherNumber,
        voucherDate: new Date(voucher.voucherDate).toISOString().slice(0, 10),
        narration: voucher.narration || "",
        lines: (voucher.lines || []).map((l) => ({
          accountId: l.accountId.toString(),
          narration: l.narration || "",
          amount: l.debit || l.credit || "0",
        })),
      });
    } catch (err: any) {
      toast({ title: "Failed to load voucher", description: err?.message, variant: "destructive" });
    }
  };

  const handleSubmit = async (data: ReceiptFormData) => {
    if (activeLines.length === 0) {
      toast({ title: "Add at least one line with an account and amount", variant: "destructive" });
      return;
    }
    if (totalAmount === 0) {
      toast({ title: "Amount must be greater than 0", variant: "destructive" });
      return;
    }
    const payload: ReceiptFormData = {
      ...data,
      lines: activeLines.map((l) => ({
        ...l,
        accountId: l.accountId as string,
      })),
    };
    // ensure voucher number exists (defensive, in case fetch failed)
    if (!data.voucherNumber) {
      await fetchNextNumber(data.voucherType);
    }

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
  const displayDebit = voucherType === "DR" ? totalAmount : 0;
  const displayCredit = voucherType === "CR" ? totalAmount : 0;
  const totalDebit = totalAmount; // kept for list and backend alignment
  const totalCredit = totalAmount;
  const amountWords = useMemo(
    () => numberToWords(Math.round(totalAmount)) + " only",
    [totalAmount]
  );

  const startNew = () => {
    setEditingId(null);
    form.reset(buildDefaults());
    setIsDialogOpen(true);
    fetchNextNumber("CR");
  };

  const accountTitleForRow = (r: Receipt) => {
    if (r.primaryAccountName) return r.primaryAccountName;
    const firstLineAccId = r.lines?.[0]?.accountId;
    return accounts.find((a) => a.id === firstLineAccId)?.name || "";
  };

  const amountTitle = t("total") || "Amount";

  const columns: Column<Receipt>[] = [
    { key: "voucherNumber", title: t("voucherNumber"), render: (r) => <span className="font-mono text-sm">{r.voucherNumber}</span> },
    { key: "voucherDate", title: t("voucherDate"), render: (r) => format(new Date(r.voucherDate), "dd MMM yyyy") },
    { key: "voucherType", title: t("voucherType"), render: (r) => <span className="font-mono">{r.voucherType}</span> },
    { key: "account", title: t("account"), render: (r) => <span>{accountTitleForRow(r) || "-"}</span> },
    { key: "amount", title: amountTitle, align: "right", render: (r) => {
      const amt = parseFloat(r.totalDebit || r.totalCredit || "0");
      return <span className="font-mono">{amt.toLocaleString()}</span>;
    } },
    { key: "actions", title: t("actions"), render: (r) => (
      <div className="flex gap-2">
        <Button size="icon" variant="ghost" onClick={() => handleEdit(r.id)}><Eye className="h-4 w-4" /></Button>
        <Button size="icon" variant="ghost" onClick={() => deleteMutation.mutate(r.id)}><Trash2 className="h-4 w-4" /></Button>
      </div>
    ) },
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t("cashReceipts")}</h1>
            <p className="text-sm text-muted-foreground">Cash Receipt & Payment Vouchers</p>
          </div>
          <Select value={listFilter} onValueChange={(v) => setListFilter(v as any)}>
            <SelectTrigger className="w-32">
              <SelectValue placeholder="Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All</SelectItem>
              <SelectItem value="CR">CR</SelectItem>
              <SelectItem value="DR">DR</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button onClick={startNew}>
          <Plus className="h-4 w-4" /> {t("add")}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-4">
          <DataTable columns={columns} data={filteredReceipts} isLoading={isLoading} testIdPrefix="receipts" />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-5xl w-[100vw] max-h-[95vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={() => setIsDialogOpen(false)} aria-label="Back">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <DialogTitle>{editingId ? "Edit Cash Receipt" : "New Cash Receipt"}</DialogTitle>
              </div>
              <Button variant="ghost" onClick={startNew}>Clear</Button>
            </div>
          </DialogHeader>
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
                      <Select
                        value={field.value}
                        onValueChange={(val) => {
                          field.onChange(val);
                          fetchNextNumber(val);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder={t("voucherType")} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="CR">CR</SelectItem>
                          <SelectItem value="DR">DR</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="narration"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("narration")}</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Line</h3>
                </div>
                <div className="space-y-2">
                  {fields.slice(0, 1).map((field, idx) => {
                    const accountId = form.watch(`lines.${idx}.accountId`);
                    const accountTitle = accounts.find(a => a.id.toString() === accountId)?.name || "";
                    return (
                      <div key={field.id} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-3">
                          <FormField
                            control={form.control}
                            name={`lines.${idx}.accountId`}
                            render={({ field }) => (
                              <FormItem>
                                {idx === 0 && <FormLabel>{t("account")}</FormLabel>}
                                <Select value={field.value} onValueChange={field.onChange}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select account" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {accounts.map((a) => (
                                      <SelectItem key={a.id} value={a.id.toString()}>{a.name}</SelectItem>
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
                                {idx === 0 && <FormLabel>Amount</FormLabel>}
                                <FormControl>
                                  <Input type="number" step="0.01" {...field} />
                                </FormControl>
                              </FormItem>
                            )}
                          />
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
                    <div className="flex justify-between"><span>{t("credit")}</span><span className="font-mono">{displayCredit.toLocaleString()}</span></div>
                    <div className="text-xs text-muted-foreground">{t("amountInWords")}: {amountWords}</div>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    <Button type="button" variant="outline" onClick={() => form.reset(buildDefaults())}>Reset</Button>
                    <Button type="submit" disabled={totalAmount === 0 || createMutation.isPending || updateMutation.isPending}>
                      <Calculator className="h-4 w-4" />
                      {editingId ? "Update" : t("save")}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
