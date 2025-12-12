import { useMemo, useState } from "react";
import { Plus, Eye, Printer, Truck, Calculator } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
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
import type { Purchase, Account, Product } from "@shared/schema";
import { format } from "date-fns";

const purchaseFormSchema = z.object({
  purchaseDate: z.string().optional(),
  dueDate: z.string().optional(),
  billNo: z.string().optional(),
  bookNo: z.string().optional(),
  supplierId: z.string().min(1, "Supplier is required"),
  expenseAccountId: z.string().min(1, "Expense account is required"),
  vehicleNumber: z.string().optional(),
  brokerId: z.string().optional(),
  brokerCommissionPercent: z.string().default("0"),
  paidAmount: z.string().default("0"),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, "Product is required"),
    marka: z.string().optional(),
    bags: z.string().default("0"),
    fillingPerBagKg: z.string().default("0"),
    looseKgs: z.string().default("0"),
    lessKg: z.string().default("0"),
    bardanaKatKg: z.string().default("0"),
    rate: z.string().default("0"),
    rateUnit: z.enum(["kg", "mound", "bag", "quintal", "ton"]),
  })).min(1, "At least one item is required"),
  charges: z.array(z.object({
    type: z.enum([
      "weight",
      "freight",
      "loading_filling",
      "market_fee",
      "mitha_sukri",
      "other",
      "phone_analysis",
      "brokerage",
      "commission",
      "bardana",
      "broken_allowance",
    ]),
    mode: z.enum(["add", "less"]).default("add"),
    amount: z.string().default("0"),
    accountId: z.string().optional(),
  })).default([]),
});

type PurchaseFormData = z.infer<typeof purchaseFormSchema>;

export default function PurchasesPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [customProductDrafts, setCustomProductDrafts] = useState<Record<number, { name: string; unit: string }>>({});
  const [creatingProductIndex, setCreatingProductIndex] = useState<number | null>(null);

  const defaultCharges = useMemo(() => ([
    "weight",
    "freight",
    "loading_filling",
    "market_fee",
    "mitha_sukri",
    "other",
    "phone_analysis",
    "brokerage",
    "commission",
    "bardana",
    "broken_allowance",
  ] as const).map((type) => ({ type, mode: "add" as const, amount: "0", accountId: "" })), []);

  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      purchaseDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      billNo: "",
      bookNo: "",
      supplierId: "",
      expenseAccountId: "",
      vehicleNumber: "",
      brokerId: "",
      brokerCommissionPercent: "0",
      paidAmount: "0",
      notes: "",
      items: [{ productId: "", marka: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "kg" }],
      charges: defaultCharges,
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: purchases = [], isLoading } = useQuery<(Purchase & { supplier?: Account })[]>({
    queryKey: ["/api/reports/purchases"],
  });

  const { data: suppliers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=supplier"],
  });

  const { data: expenseAccounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=expense"],
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const getUnitForProduct = (productId?: string) =>
    products.find((p) => p.id.toString() === productId)?.unit;
  const unitOptions = [
    { value: "kg", label: "Kilogram (kg)" },
    { value: "quintal", label: "Quintal (100 kg)" },
    { value: "ton", label: "Ton (1000 kg)" },
    { value: "bag", label: "Bag" },
  ];

  const createInlineProduct = async (index: number) => {
    const draft = customProductDrafts[index];
    if (!draft || !draft.name.trim()) {
      toast({ title: "Enter a product name first", variant: "destructive" });
      return;
    }
    try {
      setCreatingProductIndex(index);
      const res = await apiRequest("POST", "/api/products", {
        name: draft.name.trim(),
        unit: draft.unit,
        salePrice: "0",
        currentStock: "0",
        avgPurchasePrice: "0",
      });
      const product: Product = await res.json();
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      form.setValue(`items.${index}.productId`, product.id.toString(), { shouldDirty: true, shouldValidate: true });
      setCustomProductDrafts((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });
      toast({ title: "Product added", description: `${product.name} (${product.unit})` });
    } catch (err: any) {
      toast({ title: "Failed to add product", description: err?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCreatingProductIndex(null);
    }
  };

  const createMutation = useMutation({
    mutationFn: (data: PurchaseFormData) =>
      apiRequest("POST", "/api/purchases", {
        ...data,
        supplierId: parseInt(data.supplierId),
        expenseAccountId: parseInt(data.expenseAccountId),
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
        brokerId: data.brokerId ? parseInt(data.brokerId) : null,
        items: data.items.map((item, idx) => ({
          productId: parseInt(item.productId),
          marka: item.marka,
          serialNo: idx + 1,
          bags: item.bags,
          fillingPerBagKg: item.fillingPerBagKg,
          looseKgs: item.looseKgs,
          lessKg: item.lessKg,
          bardanaKatKg: item.bardanaKatKg,
          rate: item.rate,
          rateUnit: item.rateUnit,
        })),
        charges: data.charges.map((c) => ({
          ...c,
          amount: c.amount || "0",
          accountId: c.accountId ? parseInt(c.accountId) : undefined,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const handleSubmit = (data: PurchaseFormData) => {
    createMutation.mutate(data);
  };

  const handleAddNew = () => {
    form.reset({
      purchaseDate: new Date().toISOString().slice(0, 10),
      dueDate: new Date().toISOString().slice(0, 10),
      billNo: "",
      bookNo: "",
      supplierId: "",
      expenseAccountId: "",
      vehicleNumber: "",
      brokerId: "",
      brokerCommissionPercent: "0",
      paidAmount: "0",
      notes: "",
      items: [{ productId: "", marka: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "kg" }],
      charges: defaultCharges,
    });
    setIsDialogOpen(true);
    setCustomProductDrafts({});
    setCreatingProductIndex(null);
  };

  const numberToWords = (num: number) => {
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
  };

  const watchItems = form.watch("items");
  const watchCharges = form.watch("charges");
  const watchCommission = form.watch("brokerCommissionPercent");
  const watchPaidAmount = form.watch("paidAmount");

  const computedItems = watchItems.map((item) => {
    const bags = parseFloat(item.bags) || 0;
    const filling = parseFloat(item.fillingPerBagKg) || 0;
    const loose = parseFloat(item.looseKgs) || 0;
    const less = parseFloat(item.lessKg) || 0;
    const bardana = parseFloat(item.bardanaKatKg) || 0;
    const rate = parseFloat(item.rate) || 0;
    const grossWeight = bags * filling + loose;
    const netWeight = Math.max(grossWeight - less - bardana, 0);
    const moundQtyFloat = netWeight / 40;
    const moundQty = Math.floor(moundQtyFloat);
    const moundRemainderKg = Math.max(netWeight - moundQty * 40, 0);
    let billingQty = netWeight;
    if (item.rateUnit === "mound") billingQty = netWeight / 40;
    if (item.rateUnit === "bag") billingQty = bags;
    if (item.rateUnit === "quintal") billingQty = netWeight / 100;
    if (item.rateUnit === "ton") billingQty = netWeight / 1000;
    const amount = rate * billingQty;
    return {
      grossWeight,
      netWeight,
      moundQty,
      moundRemainderKg,
      amount,
    };
  });

  const subtotal = computedItems.reduce((sum, i) => sum + i.amount, 0);
  const commissionAmount = (subtotal * (parseFloat(watchCommission) || 0)) / 100;
  const lineSubtotal = subtotal + commissionAmount;
  const { chargesAdd, chargesLess } = watchCharges.reduce(
    (acc, c) => {
      const amt = parseFloat(c.amount || "0") || 0;
      if (c.mode === "less") acc.chargesLess += amt;
      else acc.chargesAdd += amt;
      return acc;
    },
    { chargesAdd: 0, chargesLess: 0 }
  );
  const grandAmount = lineSubtotal + chargesAdd - chargesLess;
  const balanceDue = grandAmount - (parseFloat(watchPaidAmount || "0") || 0);
  const totalBags = watchItems.reduce((sum, i) => sum + (parseFloat(i.bags) || 0), 0);
  const totalGross = computedItems.reduce((sum, i) => sum + i.grossWeight, 0);
  const totalNet = computedItems.reduce((sum, i) => sum + i.netWeight, 0);
  const totalMound = Math.floor(totalNet / 40);
  const totalMoundRemainder = Math.max(totalNet - totalMound * 40, 0);
  const amountInWords = useMemo(() => `${numberToWords(Math.round(grandAmount))} only`, [grandAmount]);

  const columns: Column<Purchase & { supplier?: Account }>[] = [
    {
      key: "invoiceNumber",
      title: "Invoice #",
      titleUrdu: "انوائس نمبر",
      render: (item) => (
        <span className="font-mono text-sm font-medium">{item.invoiceNumber}</span>
      ),
    },
    {
      key: "supplier",
      title: "Supplier",
      titleUrdu: "سپلائر",
      render: (item) => (
        <div>
          <p className="font-medium">{item.supplier?.name || "-"}</p>
          {item.supplier?.nameUrdu && (
            <p className="text-sm text-muted-foreground font-urdu">{item.supplier.nameUrdu}</p>
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
      key: "purchaseDate",
      title: "Date",
      titleUrdu: "تاریخ",
      render: (item) => (
        <span className="text-sm">
          {format(new Date(item.purchaseDate), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "totalAmount",
      title: "Total",
      titleUrdu: "کل رقم",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium">
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
          <Button size="icon" variant="ghost" data-testid={`button-view-${item.id}`}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" data-testid={`button-print-${item.id}`}>
            <Printer className="h-4 w-4" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("purchases")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "خریداری کا انتظام" : "Manage purchase orders"}
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-purchase">
          <Plus className="h-4 w-4" />
          {t("newPurchase")}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={purchases}
            isLoading={isLoading}
            testIdPrefix="purchases"
          />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {language === "ur" ? "نئی خریداری" : "New Purchase"}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("supplier")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger data-testid="select-supplier">
                            <SelectValue placeholder={language === "ur" ? "سپلائر منتخب کریں" : "Select supplier"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id.toString()}>
                              {s.name} {s.nameUrdu && `(${s.nameUrdu})`}
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

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="brokerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("broker")} ({language === "ur" ? "اختیاری" : "Optional"})</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-broker">
                            <SelectValue placeholder={language === "ur" ? "دلال منتخب کریں" : "Select broker"} />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          {suppliers.map((s) => (
                            <SelectItem key={s.id} value={s.id.toString()}>
                              {s.name}
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
                  name="brokerCommissionPercent"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("brokerCommission")} (%)</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" data-testid="input-commission" />
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
                    onClick={() => append({ productId: "", quantity: "", pricePerUnit: "" })}
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
                        const unit =
                          selectedProductId === "__custom__"
                            ? customProductDrafts[index]?.unit || "unit"
                            : getUnitForProduct(selectedProductId) || "unit";
                        return (
                          <>
                          <div className="col-span-5">
                            <FormField
                              control={form.control}
                              name={`items.${index}.productId`}
                              render={({ field }) => (
                            <FormItem>
                              {index === 0 && <FormLabel>{language === "ur" ? "مصنوعات" : "Product"}</FormLabel>}
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger data-testid={`select-product-${index}`}>
                                    <SelectValue placeholder={language === "ur" ? "منتخب کریں" : "Select"} />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {products.map((p) => (
                                    <SelectItem key={p.id} value={p.id.toString()}>
                                      {p.name}
                                      {p.nameUrdu && ` (${p.nameUrdu})`} · {p.unit}
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

              <Card className="bg-muted/30">
                <CardContent className="pt-4">
                  <div className="space-y-2">
                    <div className={`flex justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                      <span className="text-muted-foreground">{t("subtotal")}</span>
                      <span className="font-mono">Rs. {subtotal.toLocaleString()}</span>
                    </div>
                    <div className={`flex justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                      <span className="text-muted-foreground">{t("brokerCommission")} ({watchCommission}%)</span>
                      <span className="font-mono">Rs. {commissionAmount.toLocaleString()}</span>
                    </div>
                    <div className={`flex justify-between text-lg font-semibold pt-2 border-t ${isRTL ? "flex-row-reverse" : ""}`}>
                      <span>{t("total")}</span>
                      <span className="font-mono">Rs. {totalAmount.toLocaleString()}</span>
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
                <Button type="submit" disabled={createMutation.isPending}>
                  <Calculator className="h-4 w-4" />
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
