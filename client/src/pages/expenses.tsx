import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Wallet, ReceiptText } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Account, ExpenseEntry } from "@shared/schema";

const expenseFormSchema = z.object({
  expenseAccountId: z.string().min(1, "Select an expense category"),
  payFromAccountId: z.string().min(1, "Select paying account"),
  amount: z.string().min(1, "Amount is required"),
  expenseDate: z.string().optional(),
  description: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

export default function ExpensesPage() {
  const { t, language, isRTL } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      expenseAccountId: "",
      payFromAccountId: "",
      amount: "",
      expenseDate: new Date().toISOString().slice(0, 10),
      description: "",
    },
  });

  const { data: expenseAccounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=expense"],
  });

  const { data: payAccounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: expenses = [], isLoading } = useQuery<ExpenseEntry[]>({
    queryKey: ["/api/expenses"],
  });

  const payFromOptions = useMemo(
    () => payAccounts.filter((a) => ["asset", "bank", "cash", "liability", "equity"].includes(String(a.type || "").toLowerCase())),
    [payAccounts],
  );

  const createMutation = useMutation({
    mutationFn: (data: ExpenseFormData) =>
      apiRequest("POST", "/api/expenses", {
        ...data,
        expenseAccountId: parseInt(data.expenseAccountId, 10),
        payFromAccountId: parseInt(data.payFromAccountId, 10),
        amount: data.amount,
        expenseDate: data.expenseDate,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsDialogOpen(false);
      form.reset({
        expenseAccountId: "",
        payFromAccountId: "",
        amount: "",
        expenseDate: new Date().toISOString().slice(0, 10),
        description: "",
      });
      toast({ title: t("savedSuccessfully") });
    },
    onError: async (err: any) => {
      const msg = await err?.json?.()?.error || err?.message || "Failed to save expense";
      toast({ title: "Save failed", description: String(msg), variant: "destructive" });
    },
  });

  const columns: Column<ExpenseEntry>[] = [
    {
      key: "voucherNo",
      title: "Voucher",
      render: (row) => <span className="font-mono text-sm">{row.voucherNo}</span>,
    },
    {
      key: "expenseDate",
      title: "Date",
      render: (row) => new Date(row.expenseDate as any).toLocaleDateString(),
    },
    {
      key: "expenseAccountId",
      title: "Category",
      render: (row) => expenseAccounts.find((a) => a.id === row.expenseAccountId)?.name || row.expenseAccountId,
    },
    {
      key: "payFromAccountId",
      title: "Paid From",
      render: (row) => payAccounts.find((a) => a.id === row.payFromAccountId)?.name || row.payFromAccountId,
    },
    {
      key: "amount",
      title: "Amount",
      align: "right",
      render: (row) => <span className="font-mono font-semibold">Rs. {Number(row.amount || 0).toLocaleString()}</span>,
    },
    {
      key: "description",
      title: "Description",
      render: (row) => row.description || "-",
    },
  ];

  const handleSubmit = (data: ExpenseFormData) => {
    createMutation.mutate(data);
  };

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("expenses")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "اخراجات کو ریکارڈ اور ٹریک کریں" : "Record and track expense payments"}
          </p>
        </div>
        <Button onClick={() => setIsDialogOpen(true)}>
          <Plus className="h-4 w-4" />
          {language === "ur" ? "نیا خرچ" : "Add Expense"}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable columns={columns} data={expenses} isLoading={isLoading} testIdPrefix="expense-entries" />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {language === "ur" ? "نیا خرچ" : "New Expense"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="expenseDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "تاریخ" : "Date"}</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expenseAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "خرچ کی کیٹیگری" : "Expense Category"}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={language === "ur" ? "منتخب کریں" : "Select category"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {expenseAccounts.map((acc) => (
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
                name="payFromAccountId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "ادائیگی کا اکاؤنٹ" : "Pay From"}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={language === "ur" ? "منتخب کریں" : "Select account"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {payFromOptions.map((acc) => (
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
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "رقم" : "Amount"}</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" min="0" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "تفصیل" : "Description"}</FormLabel>
                    <FormControl>
                      <Textarea rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className={`flex gap-2 pt-4 ${isRTL ? "flex-row-reverse" : "justify-end"}`}>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("loading") : t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

