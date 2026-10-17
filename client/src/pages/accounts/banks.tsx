import { PAKISTAN_BANK_OPTIONS } from "@/lib/pakistan-banks";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useState } from "react";
import { Plus, Edit, Eye, Building2, Wallet, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
import type { Account } from "@/types/schema";

const bankFormSchema = z.object({
  name: z.string().min(1, "Bank name is required"),
  nameUrdu: z.string().optional(),
  address: z.string().optional(),
  openingBalance: z.string().default("0"),
  balanceType: z.enum(["DR", "CR"]).default("DR"),
});

type BankFormData = z.infer<typeof bankFormSchema>;

export default function BanksPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBank, setEditingBank] = useState<Account | null>(null);
  const [viewingBank, setViewingBank] = useState<Account | null>(null);

  const form = useForm<BankFormData>({
    resolver: zodResolver(bankFormSchema),
    defaultValues: {
      name: "",
      nameUrdu: "",
      address: "",
      openingBalance: "0",
      balanceType: "DR",
    },
  });

  const { data: banks = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=bank&active=true"],
  });

  const createMutation = useMutation({
    mutationKey: ["/api/accounts", "bank", "create"],
    meta: scopedInvalidation,
    mutationFn: (data: Omit<BankFormData, "balanceType">) =>
      apiRequest("POST", "/api/accounts", { ...data, type: "bank" }),
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const updateMutation = useMutation({
    mutationKey: ["/api/accounts", "bank", "update"],
    meta: scopedInvalidation,
    mutationFn: (data: Omit<BankFormData, "balanceType"> & { id: number }) =>
      apiRequest("PATCH", `/api/accounts/${data.id}`, data),
    onSuccess: () => {
      invalidateApi(invalidationGroups.accounts);
      setIsDialogOpen(false);
      setEditingBank(null);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ["/api/accounts", "bank", "delete"],
    meta: scopedInvalidation,
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accounts/${id}`),
    onSuccess: (_data, id) => {
      invalidateApi(invalidationGroups.accounts);
      if (viewingBank?.id === id) {
        setViewingBank(null);
      }
      toast({ title: t("deletedSuccessfully") });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Delete failed", description: error.message });
    },
  });

  const handleSubmit = ({ balanceType, ...data }: BankFormData) => {
    const abs = Math.abs(parseFloat(data.openingBalance || "0"));
    const signed = balanceType === "CR" ? -abs : abs;
    const payload = { ...data, openingBalance: String(signed) };
    if (editingBank) {
      updateMutation.mutate({ ...payload, id: editingBank.id });
    } else {
      createMutation.mutate(payload);
    }
  };

  const handleEdit = (bank: Account) => {
    setEditingBank(bank);
    form.reset({
      name: bank.name,
      nameUrdu: bank.nameUrdu || "",
      address: bank.address || "",
      openingBalance: String(Math.abs(parseFloat(bank.openingBalance || "0"))),
      balanceType: parseFloat(bank.openingBalance || "0") < 0 ? "CR" : "DR",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingBank(null);
    form.reset({
      name: "",
      nameUrdu: "",
      address: "",
      openingBalance: "0",
      balanceType: "DR",
    });
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
      titleUrdu: "",
      align: "center",
      render: (item) => (
        <div className="flex items-center justify-center gap-2">
          <Button aria-label={t("view")}
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setViewingBank(item);
            }}
            data-testid={`button-view-${item.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
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
                        <SearchableSelect
                          options={PAKISTAN_BANK_OPTIONS}
                          value={field.value}
                          onValueChange={field.onChange}
                          allowCustom
                          placeholder={language === "ur" ? "بینک منتخب کریں" : "Select bank"}
                          searchPlaceholder={language === "ur" ? "بینک تلاش کریں..." : "Search bank or type a name..."}
                          customEmptyLabel={language === "ur" ? "یہ نام استعمال کریں" : "Use this name"}
                        />
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
              <div className="space-y-2">
                <FormField
                  control={form.control}
                  name="openingBalance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("openingBalance")}</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input {...field} type="number" step="0.01" min="0" className="flex-1" data-testid="input-opening-balance" />
                        </FormControl>
                        <FormField
                          control={form.control}
                          name="balanceType"
                          render={({ field: typeField }) => (
                            <div className="flex rounded-md border">
                              <Button type="button" size="sm" variant={typeField.value === "DR" ? "default" : "ghost"} className="rounded-r-none px-3" onClick={() => typeField.onChange("DR")}>
                                {t("debit")}
                              </Button>
                              <Button type="button" size="sm" variant={typeField.value === "CR" ? "default" : "ghost"} className="rounded-l-none px-3" onClick={() => typeField.onChange("CR")}>
                                {t("credit")}
                              </Button>
                            </div>
                          )}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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


      <Dialog open={!!viewingBank} onOpenChange={(open) => !open && setViewingBank(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              Bank Details
            </DialogTitle>
          </DialogHeader>
          {viewingBank && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Name</span>
                <span className="text-right">{viewingBank.name}</span>
              </div>
              {viewingBank.nameUrdu && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Name (Urdu)</span>
                  <span className="text-right font-urdu">{viewingBank.nameUrdu}</span>
                </div>
              )}
              {viewingBank.address && (
                <div className="space-y-1">
                  <span className="text-muted-foreground">Branch/Account</span>
                  <p>{viewingBank.address}</p>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Opening Balance</span>
                <div className="flex items-center gap-1">
                  <span className="font-mono">Rs. {Math.abs(Number(viewingBank.openingBalance || 0)).toLocaleString()}</span>
                  {Number(viewingBank.openingBalance || 0) !== 0 && (
                    <Badge variant={Number(viewingBank.openingBalance || 0) >= 0 ? "default" : "destructive"} className="text-xs">
                      {Number(viewingBank.openingBalance || 0) >= 0 ? "DR" : "CR"}
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Current Balance</span>
                <span className="font-mono">Rs. {Number(viewingBank.currentBalance || 0).toLocaleString()}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
