import { Suspense, lazy, useMemo, useState } from "react";
import { Plus, Eye, Truck, FileText, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useReportDetail } from "@/components/report-detail-hook";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Sale, Account, Product } from "@shared/schema";
import { format } from "date-fns";

const formatDateInput = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
};

const parseLocalDate = (value: string) => {
  const [y, m, d] = value.split("-").map((v) => Number(v));
  return new Date(y, (m || 1) - 1, d || 1);
};

const isFutureDateString = (value: string) => {
  const today = new Date();
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const selected = parseLocalDate(value);
  return selected.getTime() > todayStart.getTime();
};

const parseApiErrorMessage = (error: unknown) => {
  if (!(error instanceof Error)) return "Unknown error";
  const message = error.message || "Unknown error";
  const colonIndex = message.indexOf(":");
  if (colonIndex === -1) return message;
  const raw = message.slice(colonIndex + 1).trim();
  if (!raw) return message;
  try {
    const parsed = JSON.parse(raw);
    if (typeof parsed === "string") return parsed;
    if (parsed?.error) {
      if (Array.isArray(parsed.error)) {
        return parsed.error.map((e: any) => e?.message).filter(Boolean).join(", ") || message;
      }
      if (typeof parsed.error === "string") return parsed.error;
    }
  } catch {
    return raw;
  }
  return message;
};

const ReportDetailDialog = lazy(() =>
  import("@/components/report-detail-dialog").then((mod) => ({
    default: mod.ReportDetailDialog,
  })),
);

const saleFormSchema = z.object({
  saleDate: z.string().optional().refine((val) => !val || !isFutureDateString(val), {
    message: "Date cannot be in the future",
  }),
  customerId: z.string().min(1, "Customer is required"),
  vehicleNumber: z.string().optional(),
  loadingCharges: z.string().default("0"),
  weighingCharges: z.string().default("0"),
  otherCharges: z.string().default("0"),
  paidAmount: z.string().default("0"),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, "Product is required"),
    quantity: z.string().min(1, "Quantity is required"),
    unit: z.string().min(1, "Unit is required"),
    pricePerUnit: z.string().min(1, "Price is required"),
  })).min(1, "At least one item is required"),
});

type SaleFormData = z.infer<typeof saleFormSchema>;

export default function SalesPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const todayString = formatDateInput(new Date());
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();
  const unitOptions = [
    { value: "kg", label: "Kilogram (kg)" },
    { value: "mound", label: "Mound (40 kg)" },
    { value: "quintal", label: "Quintal (100 kg)" },
    { value: "ton", label: "Ton (1000 kg)" },
    { value: "bag", label: "Bag" },
  ];

  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleFormSchema),
    defaultValues: {
      saleDate: formatDateInput(new Date()),
      customerId: "",
      vehicleNumber: "",
      loadingCharges: "0",
      weighingCharges: "0",
      otherCharges: "0",
      paidAmount: "0",
      notes: "",
      items: [{ productId: "", quantity: "", unit: "", pricePerUnit: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: sales = [], isLoading } = useQuery<(Sale & { customer?: Account })[]>({
    queryKey: ["/api/sales"],
  });

  const { data: customers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=customer"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const salesWithCustomer = useMemo(() => {
    const customerMap = new Map(customers.map((c) => [c.id, c]));
    return sales.map((s) => ({
      ...s,
      customer: customerMap.get(typeof s.customerId === "string" ? parseInt(s.customerId) : s.customerId),
    }));
  }, [sales, customers]);

  const getUnitForProduct = (productId?: string) =>
    products.find((p) => p.id.toString() === productId)?.unit;

  const createMutation = useMutation({
    mutationFn: (data: SaleFormData) =>
      apiRequest("POST", "/api/sales", {
        ...data,
        saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
        customerId: parseInt(data.customerId),
        items: data.items.map(item => ({
          productId: parseInt(item.productId),
          quantity: item.quantity,
          unit: item.unit,
          pricePerUnit: item.pricePerUnit,
        })),
      }),
    onError: (error: Error) => {
      const message = parseApiErrorMessage(error);
      toast({
        variant: "destructive",
        title: language === "ur" ? "Sale error" : "Sale error",
        description: message,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      setEditingId(null);
      toast({ title: t("savedSuccessfully") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: SaleFormData }) =>
      apiRequest("PATCH", `/api/sales/${id}`, {
        ...data,
        saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
        customerId: parseInt(data.customerId),
        items: data.items.map(item => ({
          productId: parseInt(item.productId),
          quantity: item.quantity,
          unit: item.unit,
          pricePerUnit: item.pricePerUnit,
        })),
      }),
    onError: (error: Error) => {
      const message = parseApiErrorMessage(error);
      toast({
        variant: "destructive",
        title: language === "ur" ? "Sale error" : "Sale error",
        description: message,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      setEditingId(null);
      toast({ title: t("savedSuccessfully") });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/sales/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/sales"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      toast({ title: language === "ur" ? "Sale deleted" : "Sale deleted" });
    },
    onError: (error: Error) => {
      toast({ variant: "destructive", title: "Delete failed", description: error.message });
    },
  });

  const handleSubmit = (data: SaleFormData) => {
    for (let index = 0; index < data.items.length; index++) {
      const item = data.items[index];
      const product = products.find((p) => p.id === parseInt(item.productId));
      if (!product) continue;

      const available = parseFloat(product.currentStock || "0");
      const requested = parseFloat(item.quantity || "0");

      if (requested > available) {
        form.setError(`items.${index}.quantity`, { type: "manual", message: "Insufficient stock" });
        toast({
          variant: "destructive",
          title: language === "ur" ? "Insufficient stock" : "Insufficient stock",
          description: `${product.name} has only ${available.toLocaleString()} ${product.unit} available.`,
        });
        return;
      }
    }

    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleAddNew = () => {
    form.reset({
      saleDate: formatDateInput(new Date()),
      customerId: "",
      vehicleNumber: "",
      loadingCharges: "0",
      weighingCharges: "0",
      otherCharges: "0",
      paidAmount: "0",
      notes: "",
      items: [{ productId: "", quantity: "", unit: "", pricePerUnit: "" }],
    });
    setEditingId(null);
    setIsDialogOpen(true);
  };

  const handleEdit = async (id: number) => {
    try {
      const res = await apiRequest("GET", `/api/sales/${id}`);
      const sale = await res.json();
      form.reset({
        saleDate: sale.saleDate ? format(new Date(sale.saleDate), "yyyy-MM-dd") : formatDateInput(new Date()),
        customerId: sale.customerId?.toString() || "",
        vehicleNumber: sale.vehicleNumber || "",
        loadingCharges: sale.loadingCharges || "0",
        weighingCharges: sale.weighingCharges || "0",
        otherCharges: sale.otherCharges || "0",
        paidAmount: sale.paidAmount || "0",
        notes: sale.notes || "",
        items: (sale.items || []).map((item: any) => {
          const productId = item.productId?.toString() || "";
          return {
            productId,
            quantity: item.quantity?.toString() || "0",
            unit: item.unit || getUnitForProduct(productId) || "",
            pricePerUnit: item.pricePerUnit?.toString() || "0",
          };
        }),
      });
      setEditingId(id);
      setIsDialogOpen(true);
    } catch (error: any) {
      toast({ title: "Failed to load sale", description: error?.message, variant: "destructive" });
    }
  };

  const handleDelete = (id: number) => {
    if (!confirm("Delete this sale? This will reverse stock and ledger impact.")) return;
    deleteMutation.mutate(id);
  };

  const watchItems = form.watch("items");
  const watchLoading = form.watch("loadingCharges");
  const watchWeighing = form.watch("weighingCharges");
  const watchOther = form.watch("otherCharges");
  
  const subtotal = watchItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.pricePerUnit) || 0;
    return sum + (qty * price);
  }, 0);
  
  const totalCharges = (parseFloat(watchLoading) || 0) + (parseFloat(watchWeighing) || 0) + (parseFloat(watchOther) || 0);
  const totalAmount = subtotal + totalCharges;

  const columns: Column<Sale & { customer?: Account }>[] = [
    {
      key: "invoiceNumber",
      title: "Invoice #",
      titleUrdu: "انوائس نمبر",
      render: (item) => (
        <span className="font-mono text-sm font-medium">{item.invoiceNumber}</span>
      ),
    },
    {
      key: "gatePassNumber",
      title: "Gate Pass",
      titleUrdu: "گیٹ پاس",
      render: (item) => (
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <FileText className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono text-sm">{item.gatePassNumber || "-"}</span>
        </div>
      ),
    },
    {
      key: "customer",
      title: "Customer",
      titleUrdu: "گاہک",
      render: (item) => (
        <div>
          <p className="font-medium">{item.customer?.name || "-"}</p>
          {item.customer?.nameUrdu && (
            <p className="text-sm text-muted-foreground font-urdu">{item.customer.nameUrdu}</p>
          )}
        </div>
      ),
    },
    {
      key: "vehicleNumber",
      title: "Vehicle",
      titleUrdu: "گاڑی",
      render: (item) => (
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          {item.vehicleNumber && (
            <>
              <Truck className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-sm">{item.vehicleNumber}</span>
            </>
          )}
        </div>
      ),
    },
    {
      key: "saleDate",
      title: "Date",
      titleUrdu: "تاریخ",
      render: (item) => (
        <span className="text-sm">
          {format(new Date(item.saleDate), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "totalAmount",
      title: "Total",
      titleUrdu: "کل رقم",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium text-primary">
          Rs. {parseFloat(item.totalAmount || "0").toLocaleString()}
        </span>
      ),
    },
    {
      key: "paidAmount",
      title: "Paid",
      titleUrdu: "ادائیگی",
      align: "right",
      render: (item) => {
        const total = parseFloat(item.totalAmount || "0");
        const paid = parseFloat(item.paidAmount || "0");
        const isPaid = paid >= total;
        return (
          <div className={`flex items-center gap-2 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <span className="font-mono text-sm">Rs. {paid.toLocaleString()}</span>
            <Badge variant={isPaid ? "default" : "secondary"} className="text-xs">
              {isPaid ? (language === "ur" ? "مکمل" : "Paid") : (language === "ur" ? "باقی" : "Due")}
            </Badge>
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
        <div className={`flex gap-1 justify-center ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button
            size="icon"
            variant="ghost"
            data-testid={`button-view-${item.id}`}
            onClick={() => openDetail({ type: "sale", id: item.id })}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            data-testid={`button-edit-${item.id}`}
            onClick={() => handleEdit(item.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            data-testid={`button-delete-${item.id}`}
            onClick={() => handleDelete(item.id)}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("sales")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "فروخت کا انتظام" : "Manage sales orders"}
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-sale">
          <Plus className="h-4 w-4" />
          {t("newSale")}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={salesWithCustomer}
            isLoading={isLoading}
            testIdPrefix="sales"
          />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {language === "ur" ? "نئی فروخت" : "New Sale"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="customerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("customer")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-customer">
                            <SelectValue placeholder={language === "ur" ? "گاہک منتخب کریں" : "Select customer"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {customers.map((c) => (
                            <SelectItem key={c.id} value={c.id.toString()}>
                              {c.name} {c.nameUrdu && `(${c.nameUrdu})`}
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
                  name="saleDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("saleDate")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" max={todayString} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="vehicleNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("vehicleNumber")}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="ABC-1234" data-testid="input-vehicle" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <h3 className="font-medium">{language === "ur" ? "آئٹمز" : "Items"}</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => append({ productId: "", quantity: "", unit: "", pricePerUnit: "" })}
                    data-testid="button-add-item"
                  >
                    <Plus className="h-4 w-4" />
                    {t("add")}
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {fields.map((field, index) => (
                    <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                      {(() => {
                        const selectedProductId = form.watch(`items.${index}.productId`);
                        const selectedUnit = form.watch(`items.${index}.unit`);
                        const unit = selectedUnit || getUnitForProduct(selectedProductId) || "unit";
                        return (
                          <>
                          <div className="col-span-4">
                            <FormField
                              control={form.control}
                              name={`items.${index}.productId`}
                              render={({ field }) => (
                            <FormItem>
                              {index === 0 && <FormLabel>{language === "ur" ? "مصنوعات" : "Product"}</FormLabel>}
                              <Select
                                onValueChange={(value) => {
                                  field.onChange(value);
                                  const productUnit = getUnitForProduct(value);
                                  const currentUnit = form.getValues(`items.${index}.unit`);
                                  if (productUnit && !currentUnit) {
                                    form.setValue(`items.${index}.unit`, productUnit, { shouldValidate: true });
                                  }
                                }}
                                value={field.value}
                              >
                                <FormControl>
                                  <SelectTrigger data-testid={`select-product-${index}`}>
                                    <SelectValue placeholder={language === "ur" ? "منتخب کریں" : "Select"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {products.map((p) => (
                                    <SelectItem key={p.id} value={p.id.toString()}>
                                      {p.name} ({p.unit}) — {parseFloat(p.currentStock).toLocaleString()} {p.unit} in stock
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
                            <FormField
                              control={form.control}
                              name={`items.${index}.quantity`}
                              render={({ field }) => (
                                <FormItem>
                                  {index === 0 && <FormLabel>{`${t("quantity")} (${unit})`}</FormLabel>}
                                  <FormControl>
                                    <Input {...field} type="number" step="0.01" data-testid={`input-quantity-${index}`} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                          )}
                        />
                      </div>
                          <div className="col-span-2">
                            <FormField
                              control={form.control}
                              name={`items.${index}.unit`}
                              render={({ field }) => (
                                <FormItem>
                                  {index === 0 && <FormLabel>Unit</FormLabel>}
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger data-testid={`select-unit-${index}`}>
                                        <SelectValue placeholder="Select" />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      {unitOptions.map((opt) => (
                                        <SelectItem key={opt.value} value={opt.value}>
                                          {opt.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                          </div>
                          <div className="col-span-3">
                            <FormField
                              control={form.control}
                              name={`items.${index}.pricePerUnit`}
                              render={({ field }) => (
                                <FormItem>
                                  {index === 0 && <FormLabel>{`${t("pricePerUnit")} (${unit})`}</FormLabel>}
                                  <FormControl>
                                    <Input {...field} type="number" step="0.01" data-testid={`input-price-${index}`} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                          )}
                        />
                      </div>
                          <div className="col-span-1">
                            {fields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => remove(index)}
                                data-testid={`button-remove-item-${index}`}
                              >
                                &times;
                              </Button>
                            )}
                          </div>
                          </>
                        );
                      })()}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="loadingCharges"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("loadingCharges")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" data-testid="input-loading" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="weighingCharges"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("weighingCharges")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" data-testid="input-weighing" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="otherCharges"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("otherCharges")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" data-testid="input-other" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div className={`flex justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                      <span className="text-muted-foreground">{t("subtotal")}</span>
                      <span className="font-mono">Rs. {subtotal.toLocaleString()}</span>
                    </div>
                    <div className={`flex justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                      <span className="text-muted-foreground">{language === "ur" ? "اضافی چارجز" : "Additional Charges"}</span>
                      <span className="font-mono">Rs. {totalCharges.toLocaleString()}</span>
                    </div>
                    <div className={`flex justify-between text-lg font-semibold pt-2 border-t ${isRTL ? "flex-row-reverse" : ""}`}>
                      <span>{t("total")}</span>
                      <span className="font-mono text-primary">Rs. {totalAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="paidAmount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("paidAmount")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" data-testid="input-paid" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "نوٹس" : "Notes"}</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={1} data-testid="input-notes" />
                      </FormControl>
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
                  <FileText className="h-4 w-4" />
                  {(createMutation.isPending || updateMutation.isPending) ? t("loading") : t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {reference ? (
        <Suspense fallback={null}>
          <ReportDetailDialog
            reference={reference}
            open={!!reference}
            onOpenChange={(open) => (!open ? closeDetail() : null)}
            detail={detail || null}
            isLoading={isDetailLoading}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
