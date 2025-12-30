import { useState } from "react";
import { Plus, Edit, Eye, Phone, MapPin, Wallet, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Account } from "@shared/schema";

const customerFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  nameUrdu: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  addressUrdu: z.string().optional(),
  openingBalance: z.string().default("0"),
});

type CustomerFormData = z.infer<typeof customerFormSchema>;

export default function CustomersPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Account | null>(null);
  const [viewingCustomer, setViewingCustomer] = useState<Account | null>(null);

  const form = useForm<CustomerFormData>({
    resolver: zodResolver(customerFormSchema),
    defaultValues: {
      name: "",
      nameUrdu: "",
      phone: "",
      address: "",
      addressUrdu: "",
      openingBalance: "0",
    },
  });

  const { data: customers = [], isLoading } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=customer&active=true"],
  });

  const createMutation = useMutation({
    mutationFn: (data: CustomerFormData) =>
      apiRequest("POST", "/api/accounts", { ...data, type: "customer" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=customer&active=true"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: CustomerFormData & { id: number }) =>
      apiRequest("PATCH", `/api/accounts/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=customer&active=true"] });
      setIsDialogOpen(false);
      setEditingCustomer(null);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/accounts/${id}`),
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/accounts?type=customer&active=true"] });
      if (viewingCustomer?.id === id) {
        setViewingCustomer(null);
      }
      toast({ title: t("deletedSuccessfully") });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Delete failed", description: error.message });
    },
  });

  const handleSubmit = (data: CustomerFormData) => {
    if (editingCustomer) {
      updateMutation.mutate({ ...data, id: editingCustomer.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (customer: Account) => {
    setEditingCustomer(customer);
    form.reset({
      name: customer.name,
      nameUrdu: customer.nameUrdu || "",
      phone: customer.phone || "",
      address: customer.address || "",
      addressUrdu: customer.addressUrdu || "",
      openingBalance: customer.openingBalance || "0",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingCustomer(null);
    form.reset({
      name: "",
      nameUrdu: "",
      phone: "",
      address: "",
      addressUrdu: "",
      openingBalance: "0",
    });
    setIsDialogOpen(true);
  };

  const columns: Column<Account>[] = [
    {
      key: "name",
      title: "Name",
      titleUrdu: "نام",
      render: (item) => (
        <div>
          <p className="font-medium">{item.name}</p>
          {item.nameUrdu && (
            <p className="text-sm text-muted-foreground font-urdu">{item.nameUrdu}</p>
          )}
        </div>
      ),
    },
    {
      key: "phone",
      title: "Phone",
      titleUrdu: "فون",
      render: (item) => (
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          {item.phone && (
            <>
              <Phone className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-sm">{item.phone}</span>
            </>
          )}
        </div>
      ),
    },
    {
      key: "address",
      title: "Address",
      titleUrdu: "پتہ",
      render: (item) => (
        <div className={`flex items-center gap-2 max-w-xs ${isRTL ? "flex-row-reverse" : ""}`}>
          {(item.address || item.addressUrdu) && (
            <>
              <MapPin className="h-3 w-3 text-muted-foreground flex-shrink-0" />
              <span className={`text-sm truncate ${isRTL ? "font-urdu" : ""}`}>
                {isRTL ? item.addressUrdu || item.address : item.address || item.addressUrdu}
              </span>
            </>
          )}
        </div>
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
            {balance !== 0 && (
              <Badge variant={balance > 0 ? "default" : "destructive"} className="text-xs">
                {balance > 0 ? (language === "ur" ? "وصولی" : "Receivable") : (language === "ur" ? "واجب الادا" : "Payable")}
              </Badge>
            )}
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
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
              setViewingCustomer(item);
            }}
            data-testid={`button-view-${item.id}`}
          >
            <Eye className="h-4 w-4" />
          </Button>
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
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
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
          <h1 className="text-2xl font-semibold">{t("customers")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "گاہکوں کا انتظام" : "Manage your customers"}
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-customer">
          <Plus className="h-4 w-4" />
          {t("add")} {t("customer")}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={customers}
            isLoading={isLoading}
            testIdPrefix="customers"
          />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {editingCustomer
                ? (language === "ur" ? "گاہک میں ترمیم" : "Edit Customer")
                : (language === "ur" ? "نیا گاہک" : "New Customer")}
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
                      <FormLabel>{t("name")}</FormLabel>
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
                      <FormLabel className="font-urdu">{t("nameUrdu")}</FormLabel>
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
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("phone")}</FormLabel>
                    <FormControl>
                      <Input {...field} type="tel" data-testid="input-phone" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="address"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("address")}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} data-testid="input-address" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="addressUrdu"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-urdu">پتہ (اردو)</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={2} className="font-urdu text-right" dir="rtl" data-testid="input-address-urdu" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
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
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)} data-testid="button-cancel">
                  {t("cancel")}
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save"
                >
                  {(createMutation.isPending || updateMutation.isPending) ? t("loading") : t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!viewingCustomer} onOpenChange={(open) => !open && setViewingCustomer(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              Customer Details
            </DialogTitle>
          </DialogHeader>
          {viewingCustomer && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Name</span>
                <span className="text-right">{viewingCustomer.name}</span>
              </div>
              {viewingCustomer.nameUrdu && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Name (Urdu)</span>
                  <span className="text-right font-urdu">{viewingCustomer.nameUrdu}</span>
                </div>
              )}
              {viewingCustomer.phone && (
                <div className="flex items-center justify-between gap-4">
                  <span className="text-muted-foreground">Phone</span>
                  <span className="font-mono">{viewingCustomer.phone}</span>
                </div>
              )}
              {(viewingCustomer.address || viewingCustomer.addressUrdu) && (
                <div className="space-y-1">
                  <span className="text-muted-foreground">Address</span>
                  <p>{viewingCustomer.address || viewingCustomer.addressUrdu}</p>
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Opening Balance</span>
                <span className="font-mono">Rs. {Number(viewingCustomer.openingBalance || 0).toLocaleString()}</span>
              </div>
              <div className="flex items-center justify-between gap-4">
                <span className="text-muted-foreground">Current Balance</span>
                <span className="font-mono">Rs. {Number(viewingCustomer.currentBalance || 0).toLocaleString()}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
