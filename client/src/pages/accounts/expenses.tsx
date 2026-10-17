import { useState } from "react";
import { Plus, Edit, Receipt, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";
import { useToast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Account } from "@/types/schema";

const expenseFormSchema = z.object({
  name: z.string().min(1, "Category name is required"),
  nameUrdu: z.string().optional(),
  openingBalance: z.string().optional(),
  openingType: z.enum(["debit", "credit"]).default("debit"),
  description: z.string().optional(),
});

type ExpenseFormData = z.infer<typeof expenseFormSchema>;

export default function ExpensesPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Account | null>(null);

  const form = useForm<ExpenseFormData>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      name: "",
      nameUrdu: "",
      openingBalance: "",
      openingType: "debit",
      description: "",
    },
  });

  const { data: expenses = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=expense"],
  });

  const createMutation = useMutation({
    mutationKey: ["/api/accounts", "expense", "create"],
    meta: scopedInvalidation,
    mutationFn: (data: ExpenseFormData) => {
      const amt = parseFloat(data.openingBalance || "0") || 0;
      const ob = amt > 0 && data.openingType === "credit" ? (-amt).toString() : amt.toString();
      return apiRequest("POST", "/api/accounts", {
        name: data.name,
        nameUrdu: data.nameUrdu,
        type: "expense",
        openingBalance: ob,
        description: data.description,
      });
    },
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ["/api/accounts", "expense", "delete"],
    meta: scopedInvalidation,
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accounts/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/accounts?type=expense"] });
      const previousExpenses = queryClient.getQueryData<Account[]>([
        "/api/accounts?type=expense",
      ]);
      queryClient.setQueryData<Account[]>(["/api/accounts?type=expense"], (old) =>
        old ? old.filter((exp) => exp.id !== id) : old
      );
      return { previousExpenses };
    },
    onError: (_err, _id, context) => {
      if (context?.previousExpenses) {
        queryClient.setQueryData(["/api/accounts?type=expense"], context.previousExpenses);
      }
      toast({ title: "Delete failed", variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: t("deletedSuccessfully") });
    },
    onSettled: () => {
      invalidateApi(invalidationGroups.accounts);
    },
  });

  const updateMutation = useMutation({
    mutationKey: ["/api/accounts", "expense", "update"],
    meta: scopedInvalidation,
    mutationFn: (data: ExpenseFormData & { id: number }) =>
      apiRequest("PATCH", `/api/accounts/${data.id}`, data),
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
      setIsDialogOpen(false);
      setEditingExpense(null);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const handleSubmit = (data: ExpenseFormData) => {
    if (editingExpense) {
      updateMutation.mutate({ ...data, id: editingExpense.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (expense: Account) => {
    setEditingExpense(expense);
    const obVal = parseFloat(expense.openingBalance || "0");
    form.reset({
      name: expense.name,
      nameUrdu: expense.nameUrdu || "",
      openingBalance: obVal !== 0 ? Math.abs(obVal).toString() : "",
      openingType: obVal < 0 ? "credit" : "debit",
      description: "",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingExpense(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const columns: Column<Account>[] = [
    {
      key: "name",
      title: "Category Name",
      titleUrdu: "زمرہ کا نام",
      render: (item) => (
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-3/10">
            <Receipt className="h-4 w-4 text-chart-3" />
          </div>
          <div>
            <p className="font-medium">{item.name}</p>
            {item.nameUrdu && (
              <p className="text-sm text-muted-foreground font-urdu">{item.nameUrdu}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "actions",
      title: "Actions",
      titleUrdu: "\u0627\u06cc\u06a9\u0634\u0646\u0632",
      align: "center",
      render: (item) => (
        <div className="flex items-center justify-center gap-2">
          <Button aria-label={t("edit")}
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              handleEdit(item);
            }}
            data-testid={`button-edit-${item.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button aria-label={t("delete")}
                size="icon"
                variant="ghost"
                onClick={(e) => e.stopPropagation()}
                data-testid={`button-delete-${item.id}`}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader className={isRTL ? "text-right" : ""}>
                <AlertDialogTitle>
                  {t("delete")} {item.name}
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
                  onClick={() => deleteMutation.mutate(item.id)}
                  disabled={deleteMutation.isPending}
                  data-testid={`confirm-delete-${item.id}`}
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

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("expenses")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "اخراجات کے زمرہ جات کا انتظام" : "Manage expense categories"}
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-expense">
          <Plus className="h-4 w-4" />
          {t("add")} {language === "ur" ? "زمرہ" : "Category"}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={expenses}
            isLoading={isLoading}
            testIdPrefix="expenses"
          />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {editingExpense
                ? (language === "ur" ? "زمرہ میں ترمیم" : "Edit Category")
                : (language === "ur" ? "نیا زمرہ" : "New Category")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "زمرہ کا نام" : "Category Name"}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-name" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="nameUrdu"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="font-urdu">زمرہ کا نام (اردو)</FormLabel>
                    <FormControl>
                      <Input {...field} className="font-urdu text-right" dir="rtl" data-testid="input-name-urdu" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {!editingExpense && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name="openingBalance"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Opening Balance</FormLabel>
                          <FormControl>
                            <Input type="number" min="0" step="0.01" placeholder="0" {...field} />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="openingType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Type</FormLabel>
                          <Select value={field.value} onValueChange={field.onChange}>
                            <FormControl>
                              <SelectTrigger><SelectValue /></SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="debit">Debit</SelectItem>
                              <SelectItem value="credit">Credit</SelectItem>
                            </SelectContent>
                          </Select>
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description / Narration</FormLabel>
                        <FormControl>
                          <Input placeholder="Optional" {...field} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                </>
              )}
              <div className={`flex gap-2 pt-4 ${isRTL ? "flex-row-reverse" : "justify-end"}`}>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {(createMutation.isPending || updateMutation.isPending) ? t("loading") : t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
