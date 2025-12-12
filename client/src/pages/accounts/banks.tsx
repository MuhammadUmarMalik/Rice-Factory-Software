import { useState } from "react";
import { Plus, Edit, Building2, Wallet } from "lucide-react";
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

const bankFormSchema = z.object({
  name: z.string().min(1, "Bank name is required"),
  nameUrdu: z.string().optional(),
  address: z.string().optional(),
  openingBalance: z.string().default("0"),
});

type BankFormData = z.infer<typeof bankFormSchema>;

export default function BanksPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Account | null>(null);

  const form = useForm<BankFormData>({
    resolver: zodResolver(bankFormSchema),
    defaultValues: {
      name: "",
      nameUrdu: "",
      address: "",
      openingBalance: "0",
    },
  });

  const { data: banks = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=bank"],
  });

  const createMutation = useMutation({
    mutationFn: (data: BankFormData) =>
      apiRequest("POST", "/api/accounts", { ...data, type: "bank" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=bank"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: BankFormData & { id: number }) =>
      apiRequest("PATCH", `/api/accounts/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=bank"] });
      setIsDialogOpen(false);
      setEditingBank(null);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const handleSubmit = (data: BankFormData) => {
    if (editingBank) {
      updateMutation.mutate({ ...data, id: editingBank.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (bank: Account) => {
    setEditingBank(bank);
    form.reset({
      name: bank.name,
      nameUrdu: bank.nameUrdu || "",
      address: bank.address || "",
      openingBalance: bank.openingBalance || "0",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingBank(null);
    form.reset();
    setIsDialogOpen(true);
  };

  const columns: Column<Account>[] = [
    {
      key: "name",
      title: "Bank Name",
      titleUrdu: "بینک کا نام",
      render: (item) => (
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-chart-2/10">
            <Building2 className="h-4 w-4 text-chart-2" />
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
      key: "address",
      title: "Branch/Account",
      titleUrdu: "برانچ/اکاؤنٹ",
      render: (item) => (
        <span className="text-sm text-muted-foreground">{item.address || "-"}</span>
      ),
    },
    {
      key: "currentBalance",
      title: "Balance",
      titleUrdu: "بیلنس",
      align: "right",
      render: (item) => {
        const balance = parseFloat(item.currentBalance || "0");
        return (
          <div className={`flex items-center gap-2 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <Wallet className="h-3 w-3 text-muted-foreground" />
            <span className={`font-mono font-medium ${balance >= 0 ? "text-primary" : "text-destructive"}`}>
              Rs. {Math.abs(balance).toLocaleString()}
            </span>
          </div>
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
          <h1 className="text-2xl font-semibold">{t("banks")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "بینک اکاؤنٹس کا انتظام" : "Manage your bank accounts"}
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-bank">
          <Plus className="h-4 w-4" />
          {t("add")} {language === "ur" ? "بینک" : "Bank"}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={banks}
            isLoading={isLoading}
            testIdPrefix="banks"
          />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {editingBank
                ? (language === "ur" ? "بینک میں ترمیم" : "Edit Bank")
                : (language === "ur" ? "نیا بینک" : "New Bank")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "بینک کا نام" : "Bank Name"}</FormLabel>
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
                      <FormLabel className="font-urdu">بینک کا نام (اردو)</FormLabel>
                      <FormControl>
                        <Input {...field} className="font-urdu text-right" dir="rtl" data-testid="input-name-urdu" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="address"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "برانچ/اکاؤنٹ نمبر" : "Branch/Account No."}</FormLabel>
                    <FormControl>
                      <Input {...field} data-testid="input-address" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="openingBalance"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("openingBalance")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" data-testid="input-opening-balance" />
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
