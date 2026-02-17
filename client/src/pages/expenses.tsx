import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Plus, Eye, Edit, Trash2 } from "lucide-react";
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

const expenseFormSchema = z.object({
  expenseAccountId: z.string().min(1, "Select expense category"),
  newExpenseName: z.string().trim().optional(),
  payFromAccountId: z.string().min(1, "Select paying account"),
  amount: z.string().min(1, "Amount is required"),
  expenseDate: z.string().optional(),
  description: z.string().optional(),
}).superRefine((value, ctx) => {
  if (value.expenseAccountId === "__new__" && !value.newExpenseName?.trim()) {
    ctx.addIssue({
      code: "custom",
      path: ["newExpenseName"],
      message: "Expense category name is required",
    });
  }
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
  const [bulkCategoryInput, setBulkCategoryInput] = useState("");
  const getTodayInput = () => new Date().toISOString().slice(0, 10);

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      expenseAccountId: "",
      newExpenseName: "",
      payFromAccountId: "",
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
    return date && !Number.isNaN(date.getTime()) ? date.toISOString().slice(0, 10) : getTodayInput();
  };

  const ensureExpenseCategoryId = async (selection: string, customName?: string) => {
    if (selection !== "__new__") return parseInt(selection, 10);
    const normalized = (customName || "").trim();
    const existing = expenseAccounts.find((acc) => acc.name.trim().toLowerCase() === normalized.toLowerCase());
    if (existing) return existing.id;
    const accountRes = await apiRequest("POST", "/api/accounts", { name: normalized, type: "expense" });
    const account = await accountRes.json();
    return account.id as number;
  };

  const resetForm = () => {
    form.reset({
      expenseAccountId: "",
      newExpenseName: "",
      payFromAccountId: "",
      amount: "",
      expenseDate: getTodayInput(),
      description: "",
    });
  };

  const createMutation = useMutation({
    mutationFn: async (data: ExpenseFormData) => {
      const expenseAccountId = await ensureExpenseCategoryId(data.expenseAccountId, data.newExpenseName);

      return apiRequest("POST", "/api/expenses", {
        expenseAccountId,
        payFromAccountId: parseInt(data.payFromAccountId, 10),
        amount: data.amount,
        expenseDate: data.expenseDate,
        description: data.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=expense"] });
      setIsDialogOpen(false);
      setEditingExpense(null);
      resetForm();
      toast({ title: t("savedSuccessfully") });
    },
    onError: async (err: any) => {
      const msg = await err?.json?.()?.error || err?.message || "Failed to save expense";
      toast({ title: "Save failed", description: String(msg), variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (data: ExpenseFormData & { id: number }) => {
      const expenseAccountId = await ensureExpenseCategoryId(data.expenseAccountId, data.newExpenseName);
      return apiRequest("PATCH", `/api/expenses/${data.id}`, {
        expenseAccountId,
        payFromAccountId: parseInt(data.payFromAccountId, 10),
        amount: data.amount,
        expenseDate: data.expenseDate,
        description: data.description,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=expense"] });
      setIsDialogOpen(false);
      setEditingExpense(null);
      resetForm();
      toast({ title: t("savedSuccessfully") });
    },
    onError: async (err: any) => {
      const msg = await err?.json?.()?.error || err?.message || "Failed to update expense";
      toast({ title: "Update failed", description: String(msg), variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/expenses/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/expenses"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      if (viewingExpense?.id === id) {
        setViewingExpense(null);
      }
      toast({ title: t("deletedSuccessfully") });
    },
    onError: async (err: any) => {
      const msg = await err?.json?.()?.error || err?.message || "Failed to delete expense";
      toast({ title: "Delete failed", description: String(msg), variant: "destructive" });
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
          <Button
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
          <Button
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
              <Button
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

  const handleAddNew = () => {
    setEditingExpense(null);
    resetForm();
    setIsDialogOpen(true);
  };

  const handleEdit = (expense: ExpenseEntry) => {
    setEditingExpense(expense);
    form.reset({
      expenseAccountId: expense.expenseAccountId ? String(expense.expenseAccountId) : "",
      newExpenseName: "",
      payFromAccountId: expense.payFromAccountId ? String(expense.payFromAccountId) : "",
      amount: expense.amount || "",
      expenseDate: toDateInputValue(expense.expenseDate),
      description: expense.description || "",
    });
    setIsDialogOpen(true);
  };

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

  const createExpenseCategory = async (name: string) => {
    const normalized = name.trim();
    if (!normalized) return null;
    const existing = expenseAccounts.find((acc) => acc.name.trim().toLowerCase() === normalized.toLowerCase());
    if (existing) return existing;
    const res = await apiRequest("POST", "/api/accounts", { name: normalized, type: "expense" });
    return (await res.json()) as Account;
  };

  const handleCreateSingleCategory = async () => {
    try {
      const created = await createExpenseCategory(newCategoryName);
      if (!created) {
        toast({ title: "Category name is required", variant: "destructive" });
        return;
      }
      setNewCategoryName("");
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=expense"] });
      form.setValue("expenseAccountId", String(created.id), { shouldValidate: true });
      toast({ title: "Expense category created" });
    } catch (error: any) {
      toast({ title: "Failed to create category", description: String(error?.message || error), variant: "destructive" });
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
      for (const name of names) {
        await createExpenseCategory(name);
      }
      setBulkCategoryInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=expense"] });
      toast({ title: `${names.length} category(s) processed` });
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
        <Button onClick={handleAddNew}>
          <Plus className="h-4 w-4" />
          {language === "ur" ? "نیا خرچ" : "Add Expense"}
        </Button>
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
                : (language === "ur" ? "U+UOO OrOñU+" : "New Expense")}
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
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>Expense Category</FormLabel>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setIsCategoryDialogOpen(true)}>
                        Manage Categories
                      </Button>
                    </div>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select expense category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categoryOptions.map((acc) => (
                          <SelectItem key={acc.id} value={String(acc.id)}>
                            {acc.name}
                          </SelectItem>
                        ))}
                        <SelectItem value="__new__">+ Create new category</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {form.watch("expenseAccountId") === "__new__" && (
                <FormField
                  control={form.control}
                  name="newExpenseName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>New Category Name</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g. Office Supplies" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

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
              <Label>Create single category</Label>
              <div className="flex gap-2">
                <Input
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Enter category name"
                />
                <Button type="button" onClick={handleCreateSingleCategory}>Create</Button>
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
                    <div key={acc.id} className="py-1">{acc.name}</div>
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
