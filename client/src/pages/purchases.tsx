

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Eye, Truck, Calculator, ArrowLeft, Edit, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
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
import { useUIStore } from "@/stores/ui.store";
import { usePurchaseStore } from "@/stores/purchase/store";
import type { PurchaseMode } from "@/stores/purchase/types";

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

const purchaseFormSchema = z.object({
  purchaseDate: z.string().optional().refine((val) => !val || !isFutureDateString(val), {
    message: "Date cannot be in the future",
  }),
  moundBaseKg: z.enum(["40", "60"]).default("40"),
  billNo: z.string().optional(),
  bookNo: z.string().optional(),
  supplierId: z.string().min(1, "Supplier is required"),
  vehicleNumber: z.string().optional(),
  brokerId: z.string().optional(),
  brokerCommissionPercent: z.string().default("0"),
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
  const [location] = useLocation();
  const todayString = formatDateInput(new Date());
  const purchaseMode = useUIStore((state) => state.viewModes.purchase ?? null);
  const setViewMode = useUIStore((state) => state.setViewMode);
  const isDialogOpen = useUIStore((state) => state.modals.purchaseForm?.open ?? false);
  const openDialog = useUIStore((state) => state.openModal);
  const closeDialog = useUIStore((state) => state.closeModal);
  const setPurchaseStateMode = usePurchaseStore((state) => state.setMode);
  const setCurrentPurchase = usePurchaseStore((state) => state.setCurrent);
  const setCurrentPurchaseId = usePurchaseStore((state) => state.setCurrentId);
  const resetPurchaseState = usePurchaseStore((state) => state.resetPurchase);
  const syncPurchaseList = usePurchaseStore((state) => state.setList);
  const currentPurchase = usePurchaseStore((state) => state.current);
  const activePurchaseId = usePurchaseStore((state) => state.currentId);
  const [customProductDrafts, setCustomProductDrafts] = useState<Record<number, { name: string; unit: string }>>({});
  const [creatingProductIndex, setCreatingProductIndex] = useState<number | null>(null);
  const consumedEditId = useRef<number | null>(null);
  const setMode = (mode: PurchaseMode) => {
    setViewMode("purchase", mode);
    setPurchaseStateMode(mode);
  };

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
      purchaseDate: formatDateInput(new Date()),
      moundBaseKg: "40",
      billNo: "",
      bookNo: "",
      supplierId: "",
      vehicleNumber: "",
      brokerId: "none",
      brokerCommissionPercent: "0",
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

  const { data: purchasesData, isLoading } = useQuery<Purchase[]>({
    queryKey: ["/api/purchases"],
  });
  const purchases = Array.isArray(purchasesData) ? purchasesData : [];

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
    queryKey: ["/api/settings/summary"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/settings/summary");
      return res.json();
    },
    staleTime: 60 * 60 * 1000,
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

  useEffect(() => {
    syncPurchaseList(purchasesWithSupplier);
  }, [purchasesWithSupplier, syncPurchaseList]);

  useEffect(() => {
    return () => {
      resetPurchaseState();
      setViewMode("purchase", null);
      closeDialog("purchaseForm");
    };
  }, [closeDialog, resetPurchaseState, setViewMode]);

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
        paidAmount: "0",
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
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Unable to save purchase",
        description: parseApiErrorMessage(error),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      closeDialog("purchaseForm");
      setMode(null);
      resetPurchaseState();
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
        paidAmount: "0",
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
    onError: (error: Error) => {
      toast({
        variant: "destructive",
        title: "Unable to update purchase",
        description: parseApiErrorMessage(error),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/reports/purchases"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      closeDialog("purchaseForm");
      setMode(null);
      resetPurchaseState();
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
      await queryClient.cancelQueries({ queryKey: ["/api/purchases"] });
      const prev = queryClient.getQueryData<Purchase[]>(["/api/purchases"]);
      queryClient.setQueryData<Purchase[]>(["/api/purchases"], (old) =>
        old ? old.filter((p) => p.id !== id) : old
      );
      return { prev };
    },
    onError: (_err, id, ctx) => {
      if (ctx?.prev) {
        queryClient.setQueryData(["/api/purchases"], ctx.prev);
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
    resetPurchaseState();
    setMode("create");
    form.reset({
      purchaseDate: formatDateInput(new Date()),
      moundBaseKg: "40",
      billNo: nextBill?.billNo || "",
      bookNo: "",
      supplierId: "",
      vehicleNumber: "",
      brokerId: "none",
      brokerCommissionPercent: "0",
      notes: "",
      items: [{ productId: "", marka: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "kg" }],
      charges: defaultCharges,
    });
    openDialog("purchaseForm");
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
      purchaseDate: purchase.purchaseDate ? format(new Date(purchase.purchaseDate), "yyyy-MM-dd") : formatDateInput(new Date()),
      moundBaseKg: "40",
      billNo: purchase.billNo || "",
      bookNo: purchase.bookNo || "",
      supplierId: purchase.supplierId ? String(purchase.supplierId) : "",
      vehicleNumber: purchase.vehicleNumber || "",
      brokerId: purchase.brokerId ? String(purchase.brokerId) : "none",
      brokerCommissionPercent: purchase.brokerCommissionPercent || "0",
      notes: purchase.notes || "",
      items: normalizedItems,
      charges: normalizedCharges,
    });
  };

  const loadPurchaseDetail = async (purchaseId: number) => {
    const res = await apiRequest("GET", `/api/purchases/${purchaseId}`);
    if (!res.ok) throw new Error("Failed to load purchase detail");
    return res.json();
  };

  const handleEditById = async (purchaseId: number) => {
    try {
      const detail = await loadPurchaseDetail(purchaseId);
      setMode("edit");
      setCurrentPurchase(detail as any);
      setCurrentPurchaseId(purchaseId);
      populateFormFromPurchase(detail);
      openDialog("purchaseForm");
    } catch (err: any) {
      toast({ title: "Failed to load purchase detail", description: err?.message || "Unknown error", variant: "destructive" });
    }
  };

  const handleEdit = async (purchase: Purchase) => {
    try {
      const detail = await loadPurchaseDetail(purchase.id);
      setMode("edit");
      setCurrentPurchase(detail as any);
      setCurrentPurchaseId(purchase.id);
      populateFormFromPurchase(detail);
      openDialog("purchaseForm");
    } catch (err: any) {
      toast({ title: "Failed to load purchase detail", description: err?.message || "Unknown error", variant: "destructive" });
    }
  };

  const handleView = async (purchase: Purchase) => {
    try {
      const detail = await loadPurchaseDetail(purchase.id);
      setMode("view");
      setCurrentPurchase(detail as any);
      setCurrentPurchaseId(purchase.id);
      populateFormFromPurchase(detail);
      openDialog("purchaseForm");
    } catch (err: any) {
      toast({ title: "Failed to load purchase detail", description: err?.message || "Unknown error", variant: "destructive" });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.split("?")[1] || "");
    const editParam = params.get("editId");
    if (!editParam) return;
    const id = Number(editParam);
    if (!Number.isFinite(id) || consumedEditId.current === id) return;
    consumedEditId.current = id;
    handleEditById(id);
  }, [location]);
  const handleCloseDialog = () => {
    closeDialog("purchaseForm");
    setMode(null);
    resetPurchaseState();
    form.reset();
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
  const watchMoundBase = form.watch("moundBaseKg");
  const moundBaseKg = watchMoundBase === "60" ? 60 : 40;
  const computedItems = watchItems.map((item) => {
    const bags = parseFloat(item.bags) || 0;
    const filling = parseFloat(item.fillingPerBagKg) || 0;
    const loose = parseFloat(item.looseKgs) || 0;
    const less = parseFloat(item.lessKg) || 0;
    const bardana = parseFloat(item.bardanaKatKg) || 0;
    const rate = parseFloat(item.rate) || 0;
    const grossWeight = bags * filling + loose;
    const netWeight = Math.max(grossWeight - less - bardana, 0);
    const moundQty = netWeight / moundBaseKg;
    const moundWhole = Math.floor(moundQty);
    const moundRemainderKg = Math.max(netWeight - moundWhole * moundBaseKg, 0);
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
  const totalBags = watchItems.reduce((sum, i) => sum + (parseFloat(i.bags) || 0), 0);
  const totalGross = computedItems.reduce((sum, i) => sum + i.grossWeight, 0);
  const totalNet = computedItems.reduce((sum, i) => sum + i.netWeight, 0);
  const totalWeightPerBag = totalBags > 0 ? totalNet / totalBags : 0;
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
                  {t("delete")} {item.invoiceNumber}
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

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog();
          }
        }}
      >
        <DialogContent
          className={`${isViewMode ? "sm:max-w-3xl w-full max-h-[80vh]" : "sm:max-w-[96vw] max-w-[96vw] w-[96vw] h-[95vh]"} overflow-y-auto`}
        >
          <DialogHeader>
            <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className="flex items-center gap-2">
                {purchaseMode !== "view" && (
                  <Button variant="ghost" size="icon" onClick={handleCloseDialog} aria-label="Back">
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
              {purchaseMode === "view" && currentPurchase?.id && (
                <PrintActions
                  docKey={docKeys.purchaseInvoice}
                  params={{ purchaseId: currentPurchase.id }}
                  title="Purchase Invoice"
                />
              )}
            </div>
            <DialogDescription className="sr-only">
              Create or edit a purchase by selecting supplier, entering items, charges, and notes.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              {purchaseMode !== "view" && (
                <fieldset>
                <div className="grid grid-cols-1 gap-4">
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

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                                    <SelectItem value="mound">Maund</SelectItem>
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
                                      <SelectItem value="none">None</SelectItem>
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
                      <div className="flex justify-between"><span>Weight per Bag</span><span className="font-mono">{totalWeightPerBag.toFixed(2)} kg</span></div>
                      <div className="flex justify-between"><span>Maund ({moundBaseKg} kg)</span><span className="font-mono">{totalMound} + {totalMoundRemainder.toFixed(2)}kg</span></div>
                      <div className="flex justify-between"><span>Line Subtotal</span><span className="font-mono">Rs. {subtotal.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Commission</span><span className="font-mono">Rs. {commissionAmount.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Charges +</span><span className="font-mono">Rs. {chargesAdd.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span>Charges -</span><span className="font-mono">Rs. {chargesLess.toLocaleString()}</span></div>
                      <div className="flex justify-between text-lg font-semibold pt-1 border-t">
                        <span>Grand Amount</span>
                        <span className="font-mono">Rs. {grandAmount.toLocaleString()}</span>
                      </div>
                      <div className="text-muted-foreground text-xs">In words: {amountInWords}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
                </fieldset>
              )}

              {purchaseMode === "view" && currentPurchase && (
                <Card className="border bg-muted/40">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Invoice #</p>
                        <p className="font-mono font-medium">{currentPurchase.invoiceNumber}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-medium">
                          {currentPurchase.purchaseDate ? format(new Date(currentPurchase.purchaseDate), "dd MMM yyyy") : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Supplier</p>
                        <p className="font-medium">{(currentPurchase as any).supplier?.name || "-"}</p>
                        {(currentPurchase as any).supplier?.nameUrdu && (
                          <p className="text-sm text-muted-foreground font-urdu">{(currentPurchase as any).supplier?.nameUrdu}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Vehicle</p>
                        <p className="font-mono">{currentPurchase.vehicleNumber || "-"}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Bags</p>
                        <p className="font-mono font-semibold">{Number(currentPurchase.totalBags || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Gross Wt (kg)</p>
                        <p className="font-mono font-semibold">{Number(currentPurchase.totalGrossWeightKg || 0).toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Net Wt (kg)</p>
                        <p className="font-mono font-semibold">{Number(currentPurchase.totalNetWeightKg || 0).toLocaleString()}</p>
                      </div>
                    </div>
                    {currentPurchase.items && currentPurchase.items.length > 0 && (
                      <div className="border rounded-md p-3 bg-white">
                        <p className="text-xs uppercase text-muted-foreground mb-2">Item details</p>
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <p className="text-muted-foreground text-xs">Bags</p>
                            <p className="font-mono">{currentPurchase.items[0].bags}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Filling (kg)</p>
                            <p className="font-mono">{currentPurchase.items[0].fillingPerBagKg}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Loose (kg)</p>
                            <p className="font-mono">{currentPurchase.items[0].looseKgs}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Less (kg)</p>
                            <p className="font-mono">{currentPurchase.items[0].lessKg}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Bardana (kg)</p>
                            <p className="font-mono">{currentPurchase.items[0].bardanaKatKg}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">Rate</p>
                            <p className="font-mono">
                              {currentPurchase.items[0].rate} / {currentPurchase.items[0].rateUnit}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Total Amount</p>
                        <p className="font-mono font-semibold">Rs. {Number(currentPurchase.totalAmount || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className={`flex gap-2 pt-4 ${isRTL ? "flex-row-reverse" : "justify-end"}`}>
                {purchaseMode !== "view" && (
                  <>
                    <Button type="button" variant="outline" onClick={handleCloseDialog}>
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
