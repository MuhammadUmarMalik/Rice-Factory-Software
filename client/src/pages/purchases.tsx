

import { useEffect, useMemo, useState } from "react";
import { Plus, Eye, Truck, Calculator, ArrowLeft, Edit, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
  DialogDescription,
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
import { useQuery as useRQQuery } from "@tanstack/react-query";

const purchaseFormSchema = z.object({
  purchaseDate: z.string().optional(),
  moundBaseKg: z.enum(["40", "60"]).default("40"),
  billNo: z.string().optional(),
  bookNo: z.string().optional(),
  supplierId: z.string().min(1, "Supplier is required"),
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
type PurchaseMode = "view" | "edit" | "create" | null;

export default function PurchasesPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [purchaseMode, setPurchaseMode] = useState<PurchaseMode>(null);
  const [activePurchaseId, setActivePurchaseId] = useState<number | null>(null);
  const [viewPurchase, setViewPurchase] = useState<(Purchase & { items?: any[]; charges?: any[]; supplier?: Account }) | null>(null);
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
  ] as const).map((type) => ({ type, mode: "add" as const, amount: "0", accountId: "none" })), []);

  const form = useForm<PurchaseFormData>({
    resolver: zodResolver(purchaseFormSchema),
    defaultValues: {
      purchaseDate: new Date().toISOString().slice(0, 10),
      moundBaseKg: "40",
      billNo: "",
      bookNo: "",
      supplierId: "",
      vehicleNumber: "",
      brokerId: "none",
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

  const { fields: chargeFields } = useFieldArray({
    control: form.control,
    name: "charges",
  });

  const { data: purchases = [], isLoading } = useQuery<(Purchase & { supplier?: Account })[]>({
    // Use report endpoint to include supplier/charges details for display
    queryKey: ["/api/reports/purchases"],
  });

  const { data: suppliers = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=supplier"],
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const { data: settings } = useRQQuery<{ businessName?: string; businessNameUrdu?: string }>({
    queryKey: ["/api/settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings");
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const { data: nextBill, refetch: refetchBillNo } = useQuery<{ billNo: string }>({
    queryKey: ["/api/purchases/next-bill-number"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/purchases/next-bill-number");
      return res.json();
    },
    enabled: isDialogOpen,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isDialogOpen && nextBill?.billNo) {
      form.setValue("billNo", nextBill.billNo, { shouldDirty: false, shouldValidate: true });
    }
  }, [form, isDialogOpen, nextBill]);

  const purchasesWithSupplier = useMemo(() => {
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));
    return purchases.map((p) => ({
      ...p,
      supplier: supplierMap.get(typeof p.supplierId === "string" ? parseInt(p.supplierId) : p.supplierId),
    }));
  }, [purchases, suppliers]);

  const getUnitForProduct = (productId?: string) =>
    products.find((p) => p.id.toString() === productId)?.unit;
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
        billNo: data.billNo || nextBill?.billNo || undefined,
        supplierId: parseInt(data.supplierId),
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
        brokerId: data.brokerId && data.brokerId !== "none" ? parseInt(data.brokerId) : null,
        moundBaseKg: moundBaseKg.toString(),
        items: data.items.map((item, idx) => ({
          productId: parseInt(item.productId),
          marka: item.marka,
          serialNo: idx + 1,
          bags: item.bags || "0",
          fillingPerBagKg: item.fillingPerBagKg || "0",
          looseKgs: item.looseKgs || "0",
          lessKg: item.lessKg || "0",
          bardanaKatKg: item.bardanaKatKg || "0",
          rate: item.rate || "0",
          rateUnit: item.rateUnit,
        })),
        charges: data.charges.map((c) => ({
          ...c,
          amount: c.amount || "0",
          accountId: c.accountId && c.accountId !== "none" ? parseInt(c.accountId) : undefined,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { id: number; data: PurchaseFormData }) =>
      apiRequest("PATCH", `/api/purchases/${payload.id}`, {
        ...payload.data,
        billNo: payload.data.billNo || undefined,
        supplierId: parseInt(payload.data.supplierId),
        purchaseDate: payload.data.purchaseDate ? new Date(payload.data.purchaseDate) : undefined,
        brokerId: payload.data.brokerId && payload.data.brokerId !== "none" ? parseInt(payload.data.brokerId) : null,
        moundBaseKg: moundBaseKg.toString(),
        items: payload.data.items.map((item, idx) => ({
          productId: parseInt(item.productId),
          marka: item.marka,
          serialNo: idx + 1,
          bags: item.bags || "0",
          fillingPerBagKg: item.fillingPerBagKg || "0",
          looseKgs: item.looseKgs || "0",
          lessKg: item.lessKg || "0",
          bardanaKatKg: item.bardanaKatKg || "0",
          rate: item.rate || "0",
          rateUnit: item.rateUnit,
        })),
        charges: payload.data.charges.map((c) => ({
          ...c,
          amount: c.amount || "0",
          accountId: c.accountId && c.accountId !== "none" ? parseInt(c.accountId) : undefined,
        })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      setPurchaseMode(null);
      setActivePurchaseId(null);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const handleSubmit = (data: PurchaseFormData) => {
    if (purchaseMode === "edit" && activePurchaseId) {
      updateMutation.mutate({ id: activePurchaseId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/purchases/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/reports/purchases"] });
      const prev = queryClient.getQueryData<(Purchase & { supplier?: Account })[]>(["/api/reports/purchases"]);
      queryClient.setQueryData<(Purchase & { supplier?: Account })[]>(["/api/reports/purchases"], (old) =>
        old ? old.filter((p) => p.id !== id) : old
      );
      return { prev };
    },
    onError: (_err, id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["/api/reports/purchases"], ctx.prev);
      }
      toast({ title: `Delete failed for purchase ${id}`, variant: "destructive" });
    },
    onSuccess: () => {
      toast({ title: t("deletedSuccessfully") });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  const handleAddNew = () => {
    setPurchaseMode("create");
    setViewPurchase(null);
    setActivePurchaseId(null);
    form.reset({
      purchaseDate: new Date().toISOString().slice(0, 10),
      moundBaseKg: "40",
      billNo: nextBill?.billNo || "",
      bookNo: "",
      supplierId: "",
      vehicleNumber: "",
      brokerId: "none",
      brokerCommissionPercent: "0",
      paidAmount: "0",
      notes: "",
      items: [{ productId: "", marka: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "kg" }],
      charges: defaultCharges,
    });
    setIsDialogOpen(true);
    refetchBillNo();
    setCustomProductDrafts({});
    setCreatingProductIndex(null);
  };

  const populateFormFromPurchase = (purchase: Purchase & { items?: any[]; charges?: any[] }) => {
    const items = (purchase as any).items || [];
    const charges = (purchase as any).charges || [];
    const normalizedItems =
      items.length > 0
        ? items.map((item: any) => ({
            productId: String(item.productId ?? ""),
            marka: item.marka || "",
            bags: item.bags || "0",
            fillingPerBagKg: item.fillingPerBagKg || "0",
            looseKgs: item.looseKgs || "0",
            lessKg: item.lessKg || "0",
            bardanaKatKg: item.bardanaKatKg || "0",
            rate: item.rate || "0",
            rateUnit: (item.rateUnit as PurchaseFormData["items"][number]["rateUnit"]) || "kg",
          }))
        : [{ productId: "", marka: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "kg" }];
    const normalizedCharges =
      charges.length > 0
        ? charges.map((c: any) => ({
            type: c.type,
            mode: c.mode || "add",
            amount: c.amount || "0",
            accountId: c.accountId ? String(c.accountId) : "none",
          }))
        : defaultCharges;

    form.reset({
      purchaseDate: purchase.purchaseDate ? format(new Date(purchase.purchaseDate), "yyyy-MM-dd") : new Date().toISOString().slice(0, 10),
      moundBaseKg: "40",
      billNo: purchase.billNo || "",
      bookNo: purchase.bookNo || "",
      supplierId: purchase.supplierId ? String(purchase.supplierId) : "",
      vehicleNumber: purchase.vehicleNumber || "",
      brokerId: purchase.brokerId ? String(purchase.brokerId) : "none",
      brokerCommissionPercent: purchase.brokerCommissionPercent || "0",
      paidAmount: purchase.paidAmount || "0",
      notes: purchase.notes || "",
      items: normalizedItems,
      charges: normalizedCharges,
    });
  };

  const handleEdit = (purchase: Purchase & { items?: any[]; charges?: any[] }) => {
    setPurchaseMode("edit");
    setViewPurchase(null);
    setActivePurchaseId(purchase.id);
    populateFormFromPurchase(purchase);
    setIsDialogOpen(true);
  };

  const handleView = (purchase: Purchase & { items?: any[]; charges?: any[] }) => {
    setPurchaseMode("view");
    setViewPurchase(purchase as any);
    setActivePurchaseId(null);
    populateFormFromPurchase(purchase);
    setIsDialogOpen(true);
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

  const moundBaseKg = parseFloat(form.watch("moundBaseKg") || "40") || 40;
  const computedItems = watchItems.map((item) => {
    const bags = parseFloat(item.bags) || 0;
    const filling = parseFloat(item.fillingPerBagKg) || 0;
    const loose = parseFloat(item.looseKgs) || 0;
    const less = parseFloat(item.lessKg) || 0;
    const bardana = parseFloat(item.bardanaKatKg) || 0;
    const rate = parseFloat(item.rate) || 0;
    const grossWeight = bags * filling + loose;
    const netWeight = Math.max(grossWeight - less - bardana, 0);
    const moundQtyFloat = netWeight / moundBaseKg;
    const moundQty = Math.floor(moundQtyFloat);
    const moundRemainderKg = Math.max(netWeight - moundQty * moundBaseKg, 0);
    let billingQty = netWeight;
    if (item.rateUnit === "mound") billingQty = netWeight / moundBaseKg;
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
  const totalMound = Math.floor(totalNet / moundBaseKg);
  const totalMoundRemainder = Math.max(totalNet - totalMound * moundBaseKg, 0);
  const amountInWords = useMemo(() => `${numberToWords(Math.round(grandAmount))} only`, [grandAmount]);
  const isViewMode = purchaseMode === "view";

  const columns: Column<Purchase & { supplier?: Account }>[] = [
    {
      key: "invoiceNumber",
      title: "Invoice #",
      render: (item) => (
        <span className="font-mono text-sm font-medium">{item.invoiceNumber}</span>
      ),
    },
    {
      key: "supplier",
      title: "Supplier",
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
      render: (item) => (
        <span className="text-sm">
          {format(new Date(item.purchaseDate), "dd MMM yyyy")}
        </span>
      ),
    },
    {
      key: "totalAmount",
      title: "Total",
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
      align: "right",
      render: (item) => {
        const total = parseFloat(item.totalAmount || "0");
        const paid = parseFloat(item.paidAmount || "0");
        const isPaid = paid >= total;
        return (
          <div className={`flex items-center gap-2 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <span className="font-mono text-sm">Rs. {paid.toLocaleString()}</span>
            <Badge variant={isPaid ? "default" : "secondary"} className="text-xs">
              {isPaid ? (language === "ur" ? "Paid" : "Paid") : (language === "ur" ? "Due" : "Due")}
            </Badge>
          </div>
        );
      },
    },
    {
      key: "actions",
      title: "Actions",
      align: "center",
      render: (item) => (
        <div className={`flex gap-1 justify-center ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => handleView(item)}
            data-testid={`button-view-${item.id}`}
            title="View"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              handleEdit(item);
            }}
            data-testid={`button-edit-${item.id}`}
          >
            <Edit className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => {
              const ok = confirm("Delete this purchase?");
              if (ok) {
                deleteMutation.mutate(item.id);
              }
            }}
            data-testid={`button-delete-${item.id}`}
          >
            <Trash2 className="h-4 w-4 text-destructive" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""} screen-only`}>
        <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className={isRTL ? "text-right" : ""}>
            <h1 className="text-2xl font-semibold">{t("purchases")}</h1>
            <p className="text-sm text-muted-foreground">
              {language === "ur" ? "Manage purchase orders" : "Manage purchase orders"}
            </p>
          </div>
          <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <Button onClick={handleAddNew} data-testid="button-add-purchase">
              <Plus className="h-4 w-4" />
              {t("newPurchase")}
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="pt-6">
            <DataTable
              columns={columns}
              data={purchasesWithSupplier}
              isLoading={isLoading}
              testIdPrefix="purchases"
            />
          </CardContent>
        </Card>

      <Dialog open={isDialogOpen} onOpenChange={(open) => {
        setIsDialogOpen(open);
        if (!open) {
          setPurchaseMode(null);
          setViewPurchase(null);
          setActivePurchaseId(null);
          form.reset();
        }
      }}>
        <DialogContent
          className={`${isViewMode ? "sm:max-w-3xl w-full max-h-[80vh]" : "sm:max-w-[96vw] max-w-[96vw] w-[96vw] h-[95vh]"} overflow-y-auto`}
        >
          <DialogHeader>
            <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className="flex items-center gap-2">
                {purchaseMode !== "view" && (
                  <Button variant="ghost" size="icon" onClick={() => setIsDialogOpen(false)} aria-label="Back">
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                )}
                <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
                  {purchaseMode === "view"
                    ? (language === "ur" ? "Purchase View" : "Purchase View")
                    : purchaseMode === "edit"
                      ? (language === "ur" ? "Edit Purchase" : "Edit Purchase")
                      : (language === "ur" ? "New Purchase" : "New Purchase")}
                </DialogTitle>
              </div>
            </div>
            <DialogDescription className="sr-only">
              Create or edit a purchase by selecting supplier, entering items, charges, and payment details.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {purchaseMode !== "view" && (
                <fieldset>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="supplierId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("supplier")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger data-testid="select-supplier">
                            <SelectValue placeholder="Select supplier" />
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
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="purchaseDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("purchaseDate")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="date" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="moundBaseKg"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mound Base</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="40">40 kg (standard)</SelectItem>
                          <SelectItem value="60">60 kg</SelectItem>
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

              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="billNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bill No</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder={nextBill?.billNo || "Auto"} readOnly />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="bookNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Book No</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Book#" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="brokerId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("broker")} (optional)</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value || undefined}>
                        <FormControl>
                          <SelectTrigger data-testid="select-broker">
                            <SelectValue placeholder="Select broker" />
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
              </div>

              <div className="grid grid-cols-3 gap-4">
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
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={1} data-testid="input-notes" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4">
                <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                  <h3 className="font-medium">Items</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={isViewMode}
                    onClick={() => !isViewMode && append({ productId: "", marka: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "kg" })}
                    data-testid="button-add-item"
                  >
                    <Plus className="h-4 w-4" />
                    {t("add")}
                  </Button>
                </div>
                
                <div className="space-y-3">
                  {fields.map((field, index) => {
                    const selectedProductId = form.watch(`items.${index}.productId`);
                    const unit =
                      selectedProductId === "__custom__"
                        ? customProductDrafts[index]?.unit || "unit"
                        : getUnitForProduct(selectedProductId) || "unit";
                    const computed = computedItems[index];
                    return (
                      <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-3">
                          <FormField
                            control={form.control}
                            name={`items.${index}.productId`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Product</FormLabel>}
                                <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                  <FormControl>
                                    <SelectTrigger data-testid={`select-product-${index}`}>
                                      <SelectValue placeholder="Select" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    {products.map((p) => (
                                      <SelectItem key={p.id} value={p.id.toString()}>
                                        {p.name}{p.nameUrdu ? ` (${p.nameUrdu})` : ""} - {p.unit}
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
                            name={`items.${index}.marka`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Marka</FormLabel>}
                                <FormControl>
                                  <Input {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`items.${index}.bags`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Bags</FormLabel>}
                                <FormControl>
                                  <Input {...field} type="number" step="1" data-testid={`input-bags-${index}`} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`items.${index}.fillingPerBagKg`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Filling</FormLabel>}
                                <FormControl>
                                  <Input {...field} type="number" step="0.01" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`items.${index}.looseKgs`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Kgs</FormLabel>}
                                <FormControl>
                                  <Input {...field} type="number" step="0.01" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`items.${index}.lessKg`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Less</FormLabel>}
                                <FormControl>
                                  <Input {...field} type="number" step="0.01" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`items.${index}.bardanaKatKg`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Bardana</FormLabel>}
                                <FormControl>
                                  <Input {...field} type="number" step="0.01" />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`items.${index}.rate`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Rate</FormLabel>}
                                <FormControl>
                                  <Input {...field} type="number" step="0.01" data-testid={`input-rate-${index}`} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          <FormField
                            control={form.control}
                            name={`items.${index}.rateUnit`}
                            render={({ field }) => (
                              <FormItem>
                                {index === 0 && <FormLabel>Unit</FormLabel>}
                                <Select onValueChange={field.onChange} value={field.value ?? "kg"}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent>
                                    <SelectItem value="kg">Kg</SelectItem>
                                    <SelectItem value="mound">Mound</SelectItem>
                                    <SelectItem value="bag">Bag</SelectItem>
                                    <SelectItem value="quintal">Quintal</SelectItem>
                                    <SelectItem value="ton">Ton</SelectItem>
                                  </SelectContent>
                                </Select>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                        <div className="col-span-1">
                          {index === 0 && <FormLabel>Net (Kg)</FormLabel>}
                          <Input value={computed?.netWeight?.toFixed(2) ?? "0"} disabled />
                        </div>
                        <div className="col-span-1">
                          {index === 0 && <FormLabel>Amount</FormLabel>}
                          <Input value={computed?.amount?.toFixed(2) ?? "0"} disabled />
                        </div>
                        <div className="col-span-1">
                          {!isViewMode && fields.length > 1 && (
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
                      </div>
                    );
                  })}
                </div>
              </div>

              <Card>
                <CardContent className="pt-4 grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="font-medium">Charges</div>
                    <div className="space-y-2">
                      {chargeFields.map((charge, idx) => {
                        const labelMap: Record<string, string> = {
                          weight: "Weight Charges",
                          freight: "Freight",
                          loading_filling: "Loading / Filling",
                          market_fee: "Market Fee",
                          mitha_sukri: "Mitha Sukri",
                          other: "Other Charges",
                          phone_analysis: "Phone / Analysis",
                          brokerage: "Brokerage",
                          commission: "Commission",
                          bardana: "Bardana",
                          broken_allowance: "Broken Allowance",
                        };
                        return (
                          <div key={charge.id} className="grid grid-cols-5 gap-2 items-center">
                            <div className="col-span-2 text-sm">{labelMap[charge.type] || charge.type}</div>
                            <FormField
                              control={form.control}
                              name={`charges.${idx}.amount`}
                              render={({ field }) => (
                                <FormItem className="col-span-1">
                                  <FormControl>
                                    <Input {...field} type="number" step="0.01" />
                                  </FormControl>
                                </FormItem>
                              )}
                            />
                            <FormField
                              control={form.control}
                              name={`charges.${idx}.mode`}
                              render={({ field }) => (
                                <FormItem className="col-span-1">
                                  <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl>
                                      <SelectTrigger>
                                        <SelectValue />
                                      </SelectTrigger>
                                    </FormControl>
                                    <SelectContent>
                                      <SelectItem value="add">Add</SelectItem>
                                      <SelectItem value="less">Less</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                          <FormField
                            control={form.control}
                            name={`charges.${idx}.accountId`}
                            render={({ field }) => (
                              <FormItem className="col-span-1">
                                <Select onValueChange={field.onChange} value={field.value ?? "none"}>
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="A/C" />
                                    </SelectTrigger>
                                  </FormControl>
                                    <SelectContent>
                                      <SelectItem value="none">�</SelectItem>
                                      {accounts.map((acc) => (
                                        <SelectItem key={acc.id} value={acc.id.toString()}>
                                          {acc.name}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </FormItem>
                              )}
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="font-medium">Summary</div>
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between"><span>Total Bags</span><span className="font-mono">{totalBags.toFixed(2)}</span></div>
                      <div className="flex justify-between"><span>Total Weight</span><span className="font-mono">{totalGross.toFixed(2)} kg</span></div>
                      <div className="flex justify-between"><span>Net Weight</span><span className="font-mono">{totalNet.toFixed(2)} kg</span></div>
                      <div className="flex justify-between"><span>Mound ({moundBaseKg}kg)</span><span className="font-mono">{totalMound} + {totalMoundRemainder.toFixed(2)}kg</span></div>
                      <div className="flex justify-between"><span>Line Subtotal</span><span className="font-mono">Rs. {subtotal.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Commission</span><span className="font-mono">Rs. {commissionAmount.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Charges +</span><span className="font-mono">Rs. {chargesAdd.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Charges -</span><span className="font-mono">Rs. {chargesLess.toLocaleString()}</span></div>
                      <div className="flex justify-between text-lg font-semibold pt-1 border-t">
                        <span>Grand Amount</span>
                        <span className="font-mono">Rs. {grandAmount.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Balance Due</span>
                        <span className="font-mono">Rs. {balanceDue.toLocaleString()}</span>
                      </div>
                      <div className="text-muted-foreground text-xs">In words: {amountInWords}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
                </fieldset>
              )}

              {purchaseMode === "view" && viewPurchase && (
                <Card className="border bg-muted/40">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Invoice #</p>
                        <p className="font-mono font-medium">{viewPurchase.invoiceNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-medium">
                          {viewPurchase.purchaseDate ? format(new Date(viewPurchase.purchaseDate), "dd MMM yyyy") : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Supplier</p>
                        <p className="font-medium">{(viewPurchase as any).supplier?.name || "-"}</p>
                        {(viewPurchase as any).supplier?.nameUrdu && (
                          <p className="text-sm text-muted-foreground font-urdu">{(viewPurchase as any).supplier?.nameUrdu}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Vehicle</p>
                        <p className="font-mono">{viewPurchase.vehicleNumber || "-"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Bags</p>
                        <p className="font-mono font-semibold">{Number(viewPurchase.totalBags || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Gross Wt (kg)</p>
                        <p className="font-mono font-semibold">{Number(viewPurchase.totalGrossWeightKg || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Net Wt (kg)</p>
                        <p className="font-mono font-semibold">{Number(viewPurchase.totalNetWeightKg || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    {viewPurchase.items && viewPurchase.items.length > 0 && (
                      <div className="border rounded-md p-3 bg-white">
                        <p className="text-xs uppercase text-muted-foreground mb-2">Item details</p>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Bags</p>
                            <p className="font-mono">{viewPurchase.items[0].bags}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Filling (kg)</p>
                            <p className="font-mono">{viewPurchase.items[0].fillingPerBagKg}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Loose (kg)</p>
                            <p className="font-mono">{viewPurchase.items[0].looseKgs}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Less (kg)</p>
                            <p className="font-mono">{viewPurchase.items[0].lessKg}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Bardana (kg)</p>
                            <p className="font-mono">{viewPurchase.items[0].bardanaKatKg}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Rate</p>
                            <p className="font-mono">
                              {viewPurchase.items[0].rate} / {viewPurchase.items[0].rateUnit}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Amount</p>
                        <p className="font-mono font-semibold">Rs. {Number(viewPurchase.totalAmount || 0).toLocaleString()}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Paid</p>
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono font-semibold">Rs. {Number(viewPurchase.paidAmount || 0).toLocaleString()}</span>
                          <Badge variant={Number(viewPurchase.paidAmount || 0) >= Number(viewPurchase.totalAmount || 0) ? "default" : "secondary"}>
                            {Number(viewPurchase.paidAmount || 0) >= Number(viewPurchase.totalAmount || 0) ? "Paid" : "Due"}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className={`flex gap-2 pt-4 ${isRTL ? "flex-row-reverse" : "justify-end"}`}>
                {purchaseMode !== "view" && (
                  <>
                    <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                      {t("cancel")}
                    </Button>
                    <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                      <Calculator className="h-4 w-4" />
                      {createMutation.isPending || updateMutation.isPending ? t("loading") : t("save")}
                    </Button>
                  </>
                )}
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>

    </>
  );
}
