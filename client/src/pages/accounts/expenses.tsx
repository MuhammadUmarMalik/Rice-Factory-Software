import { useState } from "react";
import { Plus, Edit, Receipt } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
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
import { Input } from "@/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Account } from "@shared/schema";

const expenseFormSchema = z.object({
  name: z.string().min(1, "Category name is required"),
  nameUrdu: z.string().optional(),
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
    },
  });

  const { data: expenses = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts", "expense"],
    queryFn: async () => {
      const res = await fetch("/api/accounts?type=expense");
      if (!res.ok) throw new Error("Failed to fetch expenses");
      return res.json();
    },
  });

  const createMutation = useMutation({
    mutationFn: (data: ExpenseFormData) =>
      apiRequest("POST", "/api/accounts", { ...data, type: "expense" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ExpenseFormData & { id: number }) =>
      apiRequest("PATCH", `/api/accounts/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
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
    form.reset({
      name: expense.name,
      nameUrdu: expense.nameUrdu || "",
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
      key: "currentBalance",
      title: "Total Expenses",
      titleUrdu: "کل اخراجات",
      align: "right",
      render: (item) => {
        const balance = parseFloat(item.currentBalance || "0");
        return (
          <span className="font-mono font-medium">
            Rs. {Math.abs(balance).toLocaleString()}
          </span>
        );
      },
    },
    {
      key: "actions",
      title: "Actions",
      titleUrdu: "ایکشنز",
      align: "center",
      render: (item) => (
        <Button
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
