import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Eye, Edit, Trash2 } from "lucide-react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { apiRequest } from "@/lib/queryClient";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/hooks/use-toast";
import { todayLocal, toLocalDateString } from "@/utils/dateRanges";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { Label } from "@/components/ui/label";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Account, ExpenseEntry } from "@/types/schema";
import { confirmAction } from "@/components/confirm-dialog";

const expenseFormSchema = z.object({
  expenseAccountId: z.string().min(1, "Select expense category"),
  payFromAccountId: z.string().min(1, "Select paying account"),
  direction: z.enum(["debit", "credit"]).default("debit"),
  amount: z.string().min(1, "Amount is required").refine((val) => {
    const num = parseFloat(val);
    return !Number.isNaN(num) && num > 0;
  }, "Amount must be greater than zero"),
  expenseDate: z.string().optional(),
  description: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

export default function ExpensesPage() {
  const { t, language, isRTL } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<ExpenseEntry | null>(null);
  const [viewingExpense, setViewingExpense] = useState<ExpenseEntry | null>(null);
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryOpeningBalance, setNewCategoryOpeningBalance] = useState("");
  const [newCategoryOpeningType, setNewCategoryOpeningType] = useState<"debit" | "credit">("debit");
  const [bulkCategoryInput, setBulkCategoryInput] = useState("");
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const getTodayInput = todayLocal;

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      expenseAccountId: undefined,
      payFromAccountId: undefined,
      direction: "debit",
      amount: "",
      expenseDate: getTodayInput(),
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

  const getExpenseAccountName = (id?: number | null) =>
    expenseAccounts.find((a) => a.id === id)?.name || (id ? `#${id}` : "-");
  const getPayAccountName = (id?: number | null) =>
    payAccounts.find((a) => a.id === id)?.name || (id ? `#${id}` : "-");
  const formatDate = (value: unknown) => {
    const date = value ? new Date(value as any) : null;
    return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString() : "-";
  };
  const toDateInputValue = (value: unknown) => {
    const date = value ? new Date(value as any) : null;
    return date && !Number.isNaN(date.getTime()) ? toLocalDateString(date) : getTodayInput();
  };

  const resetForm = () => {
    form.reset({
      expenseAccountId: "",
      payFromAccountId: "",
      direction: "debit",
      amount: "",
      expenseDate: getTodayInput(),
      description: "",
    });
  };

  const handleAddNew = () => {
    setEditingExpense(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (expense: ExpenseEntry) => {
    setEditingExpense(expense);
    form.reset({
      expenseAccountId: expense.expenseAccountId ? String(expense.expenseAccountId) : "",
      payFromAccountId: expense.payFromAccountId ? String(expense.payFromAccountId) : "",
      direction: (expense as any).direction || "debit",
      amount: expense.amount || "",
      expenseDate: toDateInputValue(expense.expenseDate),
      description: expense.description || "",
    });
    setIsDialogOpen(true);
  };

  const createMutation = useMutation({
    mutationKey: ["/api/expenses", "create"],
    meta: scopedInvalidation,
    mutationFn: async (data: ExpenseFormData) => {
      return apiRequest("POST", "/api/expenses", {
        expenseAccountId: parseInt(data.expenseAccountId, 10),
        payFromAccountId: parseInt(data.payFromAccountId, 10),
        direction: data.direction,
        amount: data.amount,
        expenseDate: data.expenseDate,
        description: data.description,
      });
    },
    onSuccess: () => {
      invalidateApi(invalidationGroups.expenses);
      setIsDialogOpen(false);
      setEditingExpense(null);
      resetForm();
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const parsed = msg.includes(":") ? msg.slice(msg.indexOf(":") + 1).trim() : msg;
      let description = parsed;
      try {
        const j = JSON.parse(parsed);
        if (typeof j?.error === "string") description = j.error;
        else if (Array.isArray(j?.error)) description = j.error.map((e: { message?: string }) => e?.message).filter(Boolean).join(", ") || parsed;
      } catch {
        description = parsed || "Failed to save expense";
      }
      toast({ title: "Save failed", description: description || "Failed to save expense", variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationKey: ["/api/expenses", "update"],
    meta: scopedInvalidation,
    mutationFn: async (data: ExpenseFormData & { id: number }) => {
      return apiRequest("PATCH", `/api/expenses/${data.id}`, {
        expenseAccountId: parseInt(data.expenseAccountId, 10),
        payFromAccountId: parseInt(data.payFromAccountId, 10),
        direction: data.direction,
        amount: data.amount,
        expenseDate: data.expenseDate,
        description: data.description,
      });
    },
    onSuccess: () => {
      invalidateApi(invalidationGroups.expenses);
      setIsDialogOpen(false);
      setEditingExpense(null);
      resetForm();
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const parsed = msg.includes(":") ? msg.slice(msg.indexOf(":") + 1).trim() : msg;
      let description = parsed;
      try {
        const j = JSON.parse(parsed);
        if (typeof j?.error === "string") description = j.error;
        else if (Array.isArray(j?.error)) description = j.error.map((e: { message?: string }) => e?.message).filter(Boolean).join(", ") || parsed;
      } catch {
        description = parsed || "Failed to update expense";
      }
      toast({ title: "Update failed", description: description || "Failed to update expense", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ["/api/expenses", "delete"],
    meta: scopedInvalidation,
    mutationFn: (id: number) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: (_data, id) => {
      invalidateApi(invalidationGroups.expenses);
      if (viewingExpense?.id === id) {
        setViewingExpense(null);
      }
      toast({ title: t("deletedSuccessfully") });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      const parsed = msg.includes(":") ? msg.slice(msg.indexOf(":") + 1).trim() : msg;
      let description = parsed;
      try {
        const j = JSON.parse(parsed);
        if (typeof j?.error === "string") description = j.error;
        else if (Array.isArray(j?.error)) description = j.error.map((e: { message?: string }) => e?.message).filter(Boolean).join(", ") || parsed;
      } catch {
        description = parsed || "Failed to delete expense";
      }
      toast({ title: "Delete failed", description: description || "Failed to delete expense", variant: "destructive" });
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
      render: (row) => formatDate(row.expenseDate),
    },
    {
      key: "expenseAccountId",
      title: "Expense",
      render: (row) => getExpenseAccountName(row.expenseAccountId),
    },
    {
      key: "payFromAccountId",
      title: "Paid From",
      render: (row) => getPayAccountName(row.payFromAccountId),
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
    {
      key: "actions",
      title: "Actions",
      align: "center",
      render: (row) => (
        <div className="flex items-center justify-center gap-2">
          <Button aria-label={t("view")}
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setViewingExpense(row);
            }}
            data-testid={`button-view-${row.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button aria-label={t("edit")}
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(row);
            }}
            data-testid={`button-edit-${row.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button aria-label={t("delete")}
                size="icon"
                variant="ghost"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-delete-${row.id}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader className={isRTL ? "text-right" : ""}>
                <AlertDialogTitle>
                  {t("delete")} {getExpenseAccountName(row.expenseAccountId)}
                </AlertDialogTitle>
                <AlertDialogDescription className={isRTL ? "font-urdu text-right" : ""}>
                  {t("confirmDelete")}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter className={isRTL ? "flex-row-reverse" : ""}>
                <AlertDialogCancel disabled={deleteMutation.isPending}>
                  {t("cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deleteMutation.mutate(row.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`confirm-delete-${row.id}`}
                >
                  {t("delete")}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      ),
    },
  ];

  const handleSubmit = (data: ExpenseFormData) => {
    if (editingExpense) {
      updateMutation.mutate({ ...data, id: editingExpense.id });
      return;
    }
    createMutation.mutate(data);
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;
  const categoryOptions = useMemo(
    () => [...expenseAccounts].sort((a, b) => a.name.localeCompare(b.name)),
    [expenseAccounts],
  );

  const createExpenseCategory = async (name: string, openingBalance?: string, openingType?: "debit" | "credit") => {
    const normalized = name.trim();
    if (!normalized) return null;
    const existing = expenseAccounts.find((acc) => acc.name.trim().toLowerCase() === normalized.toLowerCase());
    if (existing) return existing;
    const res = await apiRequest("POST", "/api/expenses/categories", {
      name: normalized,
      openingBalance: openingBalance || "0",
      openingBalanceType: openingType || "debit",
    });
    return (await res.json()) as Account;
  };

  const deleteCategoryMutation = useMutation({
    mutationKey: ["/api/accounts", "delete"],
    meta: scopedInvalidation,
    mutationFn: (id: number) => apiRequest("DELETE", `/api/expenses/categories/${id}`),
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
      toast({ title: "Category deleted" });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      toast({ title: "Failed to delete category", description: msg, variant: "destructive" });
    },
  });

  const handleCreateSingleCategory = async () => {
    try {
      if (editingCategoryId) {
        const res = await apiRequest("PATCH", `/api/expenses/categories/${editingCategoryId}`, {
          name: newCategoryName.trim(),
        });
        if (res.ok) {
          toast({ title: "Category updated" });
        } else {
          const data = await res.json().catch(() => ({}));
          toast({ title: "Failed to update category", description: data?.error || "Unknown error", variant: "destructive" });
          return;
        }
        setEditingCategoryId(null);
      } else {
        const created = await createExpenseCategory(newCategoryName, newCategoryOpeningBalance, newCategoryOpeningType);
        if (!created) {
          toast({ title: "Category name is required", variant: "destructive" });
          return;
        }
        toast({ title: "Expense category created" });
      }
      setNewCategoryName("");
      setNewCategoryOpeningBalance("");
      setNewCategoryOpeningType("debit");
      invalidateApi(invalidationGroups.accounts);
    } catch (error: any) {
      toast({ title: "Failed to save category", description: String(error?.message || error), variant: "destructive" });
    }
  };

  const handleCreateBulkCategories = async () => {
    try {
      const names = bulkCategoryInput
        .split(/[\n,]+/)
        .map((name) => name.trim())
        .filter(Boolean);
      if (!names.length) {
        toast({ title: "Enter one or more category names", variant: "destructive" });
        return;
      }
      let created = 0;
      let skipped = 0;
      for (const name of names) {
        try {
          const result = await createExpenseCategory(name);
          if (result) created += 1;
        } catch {
          skipped += 1;
        }
      }
      setBulkCategoryInput("");
      invalidateApi(invalidationGroups.accounts);
      toast({
        title: `${created} category(s) created${skipped ? `, ${skipped} skipped` : ""}`,
      });
    } catch (error: any) {
      toast({ title: "Failed to create categories", description: String(error?.message || error), variant: "destructive" });
    }
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
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setIsCategoryDialogOpen(true)}>
            {language === "ur" ? "اخراجات کی اقسام" : "Manage Categories"}
          </Button>
          <Button onClick={handleAddNew}>
            <Plus className="h-4 w-4" />
            {language === "ur" ? "نیا خرچ" : "Add Expense"}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable columns={columns} data={expenses} isLoading={isLoading} testIdPrefix="expense-entries" />
        </CardContent>
      </Card>

<Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            setEditingExpense(null);
            resetForm();
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogDescription className="sr-only">
              Add or edit an expense by providing the name, payment account, and amount.
            </DialogDescription>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {editingExpense
                ? "Edit Expense"
                : (language === "ur" ? "نیا خرچ" : "New Expense")}
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
                    <FormLabel>{language === "ur" ? "اِخراجات کا سرخی" : "Expense Head"}</FormLabel>
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={language === "ur" ? "سرخی کا انتخاب کریں" : "Select expense head"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categoryOptions.map((acc) => (
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
                name="direction"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "سمت" : "Direction"}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={language === "ur" ? "سنت کریں" : "Select direction"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="debit">{language === "ur" ? "بے ڈیٹ" : "Debit"}</SelectItem>
                        <SelectItem value="credit">{language === "ur" ? "کریڈٹ" : "Credit"}</SelectItem>
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
                    <Select value={field.value || undefined} onValueChange={field.onChange}>
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
                      <Input type="number" step="0.01" min="0.01" {...field} />
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
                <Button type="submit" disabled={isSaving}>
                  {isSaving ? t("loading") : t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingExpense} onOpenChange={(open) => !open && setViewingExpense(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              Expense Details
            </DialogTitle>
          </DialogHeader>
          {viewingExpense && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Voucher</span>
                <span className="font-mono">{viewingExpense.voucherNo}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Date</span>
                <span>{formatDate(viewingExpense.expenseDate)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Expense</span>
                <span className="text-right">{getExpenseAccountName(viewingExpense.expenseAccountId)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Direction</span>
                <span className="text-right">{(viewingExpense as any).direction || "-"}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Paid From</span>
                <span className="text-right">{getPayAccountName(viewingExpense.payFromAccountId)}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-mono font-semibold">
                  Rs. {Number(viewingExpense.amount || 0).toLocaleString()}
                </span>
              </div>
              <div className="space-y-1">
                <span className="text-muted-foreground">Description</span>
                <p>{viewingExpense.description || "-"}</p>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>Expense Categories</DialogTitle>
            <DialogDescription className={isRTL ? "text-right font-urdu" : ""}>
              Create one category or add multiple categories at once.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>{editingCategoryId ? "Edit category" : "Create single category"}</Label>
              <div className="flex gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter category name"
                />
                <Button type="button" onClick={handleCreateSingleCategory}>
                  {editingCategoryId ? "Save" : "Create"}
                </Button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <Label className="text-xs text-muted-foreground">Opening Balance</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={newCategoryOpeningBalance}
                    onChange={(e) => setNewCategoryOpeningBalance(e.target.value)}
                    placeholder="0"
                  />
                </div>
                <div className="w-28">
                  <Label className="text-xs text-muted-foreground">Type</Label>
                  <Select value={newCategoryOpeningType} onValueChange={(v) => setNewCategoryOpeningType(v as "debit" | "credit")}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="debit">Debit</SelectItem>
                      <SelectItem value="credit">Credit</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Bulk add categories</Label>
              <Textarea
                rows={4}
                value={bulkCategoryInput}
                onChange={(e) => setBulkCategoryInput(e.target.value)}
                placeholder="Fuel, Repair, Utilities&#10;or one per line"
              />
              <Button type="button" variant="outline" onClick={handleCreateBulkCategories}>
                Add Multiple Categories
              </Button>
            </div>

            <div className="space-y-2">
              <Label>Existing categories</Label>
              <div className="max-h-36 overflow-auto rounded-md border p-2 text-sm">
                {categoryOptions.length === 0 ? (
                  <div className="text-muted-foreground">No categories yet.</div>
                ) : (
                  categoryOptions.map((acc) => (
                    <div key={acc.id} className="flex items-center justify-between py-1">
                      <span>{acc.name}</span>
                      <div className="flex gap-1">
                        <Button aria-label={t("edit")}
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6"
                          onClick={() => {
                            setEditingCategoryId(acc.id);
                            setNewCategoryName(acc.name);
                          }}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button aria-label={t("delete")}
                          size="icon"
                          variant="ghost"
                          className="h-6 w-6 text-destructive"
                          onClick={async () => {
                            if (await confirmAction("Delete this category?")) {
                              deleteCategoryMutation.mutate(acc.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
