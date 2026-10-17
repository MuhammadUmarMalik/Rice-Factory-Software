

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, Link } from "wouter";
import { invalidateApi, invalidationGroups } from "@/api/invalidation";
import { Plus, Calculator, Trash2 } from "lucide-react";
import { FormSection, SummaryRow } from "@/components/form-section";
import { formatQtyByUnit } from "@/lib/units";
import { formatMoney } from "@/utils/formatters";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";
import {
  usePurchases,
  useNextBillNumber,
  useCreatePurchase,
  useUpdatePurchase,
  useDeletePurchase,
} from "@/hooks/use-purchases";
import { useAccounts, useProducts, useOpenInPasses, useGatePass } from "@/hooks";
import { productsApi } from "@/api/products.api";
import { purchasesApi } from "@/api/purchases.api";
import { PurchasesList } from "@/pages/purchases/PurchasesList";
import { useToast } from "@/hooks/use-toast";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Purchase } from "@/types/schema";
import { format } from "date-fns";
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

const lessLabel = "Watta Kaat (Moisture + Quality)";
const bardanaLabel = "Bardana (Kaat)";
const qualityLessPerBagLabel = "Watta Kaat (Moisture + Quality) / Bag";

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
  paidAmount: z.string().default("0"),
  paymentMode: z.enum(["cash", "credit", "bank"]).default("cash"),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, "Product is required"),
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
      "freight",
      "weight",
      "loading_filling",
      "market_fee",
      "mitha_sukri",
      "other",
      "phone_analysis",
      "brokerage",
      "commission",
      "bardana",
      "broken_allowance",
      "accountant_clerk",
    ]),
    mode: z.enum(["add", "less"]).default("less"),
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
  const [linkedGatePassId, setLinkedGatePassId] = useState<number | null>(null);
  const consumedEditId = useRef<number | null>(null);
  const setMode = (mode: PurchaseMode) => {
    setViewMode("purchase", mode);
    setPurchaseStateMode(mode);
  };

  const defaultCharges = useMemo(() => ([
    "freight",
    "weight",
    "loading_filling",
    "market_fee",
    "mitha_sukri",
    "other",
    "phone_analysis",
    "brokerage",
    "commission",
    "bardana",
    "broken_allowance",
    "accountant_clerk",
  ] as const).map((type) => ({ type, mode: "less" as const, amount: "0", accountId: "none" })), []);

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
      paidAmount: "0",
      paymentMode: "cash",
      notes: "",
      items: [{ productId: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "mound" }],
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

  const { data: purchasesData, isLoading } = usePurchases();
  const purchases = Array.isArray(purchasesData) ? purchasesData : [];

  const { data: suppliers = [] } = useAccounts({ type: "supplier" });
  const { data: accounts = [] } = useAccounts();
  const { data: products = [] } = useProducts();

  const { data: nextBill, refetch: refetchBillNo } = useNextBillNumber(isDialogOpen);

  const { data: openInPasses = [] } = useOpenInPasses(isDialogOpen && purchaseMode === "create");
  const { data: linkedGatePass } = useGatePass(linkedGatePassId);

  useEffect(() => {
    if (isDialogOpen && nextBill?.billNo) {
      form.setValue("billNo", nextBill.billNo, { shouldDirty: false, shouldValidate: true });
    }
  }, [form, isDialogOpen, nextBill]);

  useEffect(() => {
    if (!linkedGatePass) return;
    form.setValue("supplierId", linkedGatePass.partyId ? String(linkedGatePass.partyId) : "", { shouldValidate: true });
    form.setValue("vehicleNumber", linkedGatePass.vehicleNo || "", { shouldValidate: true });
    const items = (linkedGatePass.items || []).map((item) => {
      const bags = item.bags || 0;
      const weightKg = item.weightG / 1000;
      return {
        productId: String(item.productId),
        bags: String(bags),
        fillingPerBagKg: bags > 0 ? String(Number((weightKg / bags).toFixed(3))) : "0",
        looseKgs: bags > 0 ? "0" : String(Number(weightKg.toFixed(3))),
        lessKg: "0",
        bardanaKatKg: "0",
        rate: "0",
        rateUnit: "mound" as const,
      };
    });
    if (items.length > 0) {
      form.setValue("items", items, { shouldValidate: true });
    }
  }, [linkedGatePass, form]);

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
      const product = await productsApi.create({
        name: draft.name.trim(),
        unit: draft.unit,
        salePrice: "0",
        currentStock: "0",
        avgPurchasePrice: "0",
      });
      invalidateApi(invalidationGroups.products);
      form.setValue(`items.${index}.productId`, product.id.toString(), { shouldDirty: true, shouldValidate: true });
      setCustomProductDrafts((prev) => {
        const copy = { ...prev };
        delete copy[index];
        return copy;
      });
      toast({ title: "Product added", description: `${product.name} (${product.unit})` });
    } catch (err: unknown) {
      toast({ title: "Failed to add product", description: (err as Error)?.message || "Unknown error", variant: "destructive" });
    } finally {
      setCreatingProductIndex(null);
    }
  };

  const createMutation = useCreatePurchase();
  const updateMutation = useUpdatePurchase();
  const deleteMutation = useDeletePurchase();

  const buildPurchasePayload = (data: PurchaseFormData) => ({
    billNo: data.billNo || nextBill?.billNo || undefined,
    bookNo: data.bookNo,
    supplierId: parseInt(data.supplierId),
    vehicleNumber: data.vehicleNumber || null,
    purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : undefined,
    brokerId: data.brokerId && data.brokerId !== "none" ? parseInt(data.brokerId) : null,
    paidAmount: data.paidAmount || "0",
    paymentMode: data.paymentMode || "cash",
    moundBaseKg: moundBaseKg.toString(),
    items: data.items.map((item, idx) => ({
      productId: parseInt(item.productId),
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
  });

  const handleSubmit = (data: PurchaseFormData) => {
    const payload = buildPurchasePayload(data);
    if (purchaseMode === "create" && linkedGatePassId) {
      (payload as Record<string, unknown>).gate_pass_id = linkedGatePassId;
    }
    const onSuccess = () => {
      closeDialog("purchaseForm");
      setMode(null);
      resetPurchaseState();
      form.reset();
      setLinkedGatePassId(null);
      toast({ title: t("savedSuccessfully") });
    };
    const onError = (error: Error) => {
      toast({
        variant: "destructive",
        title: "Unable to save purchase",
        description: parseApiErrorMessage(error),
      });
    };
    if (purchaseMode === "edit" && activePurchaseId) {
      updateMutation.mutate({ id: activePurchaseId, data: payload }, { onSuccess, onError });
    } else {
      createMutation.mutate(payload as Parameters<typeof createMutation.mutate>[0], { onSuccess, onError });
    }
  };

  const handleDelete = (purchase: Purchase) => {
    deleteMutation.mutate({ id: purchase.id, force: false }, {
      onError: (err) =>
        toast({
          title: `Delete failed for purchase ${purchase.id}`,
          description: parseApiErrorMessage(err),
          variant: "destructive",
        }),
      onSuccess: () => toast({ title: t("deletedSuccessfully") }),
    });
  };

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
      paidAmount: "0",
      paymentMode: "cash",
      notes: "",
      items: [{ productId: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "mound" }],
      charges: defaultCharges,
    });
    openDialog("purchaseForm");
    refetchBillNo();
    setCustomProductDrafts({});
    setCreatingProductIndex(null);
    setLinkedGatePassId(null);
  };

  const populateFormFromPurchase = (purchase: Purchase & { items?: any[]; charges?: any[] }) => {
    const items = (purchase as any).items || [];
    const charges = (purchase as any).charges || [];
    const normalizedItems =
      items.length > 0
        ? items.map((item: any) => ({
            productId: String(item.productId ?? ""),
            bags: item.bags || "0",
            fillingPerBagKg: item.fillingPerBagKg || "0",
            looseKgs: item.looseKgs || "0",
            lessKg: item.lessKg || "0",
            bardanaKatKg: item.bardanaKatKg || "0",
            rate: item.rate || "0",
            rateUnit: (item.rateUnit as PurchaseFormData["items"][number]["rateUnit"]) || "kg",
          }))
        : [{ productId: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "mound" }];
    const chargesByType = new Map(
      charges.map((c: any) => [
        c.type,
        {
          type: c.type,
          mode: c.mode === "less" ? "less" : "add",
          amount: c.amount || "0",
          accountId: c.accountId ? String(c.accountId) : "none",
        },
      ]),
    );
    const normalizedCharges =
      charges.length > 0
        ? defaultCharges.map((base) => chargesByType.get(base.type) || base)
        : defaultCharges;

    form.reset({
      purchaseDate: purchase.purchaseDate ? format(new Date(purchase.purchaseDate), "yyyy-MM-dd") : formatDateInput(new Date()),
      moundBaseKg: String((purchase as any).moundBaseKg ?? 40) === "60" ? "60" : "40",
      billNo: purchase.billNo || "",
      bookNo: purchase.bookNo || "",
      supplierId: purchase.supplierId ? String(purchase.supplierId) : "",
      vehicleNumber: purchase.vehicleNumber || "",
      brokerId: purchase.brokerId ? String(purchase.brokerId) : "none",
      brokerCommissionPercent: purchase.brokerCommissionPercent || "0",
      paidAmount: (purchase as any).paidAmount ?? "0",
      paymentMode: ((purchase as any).paymentMode as "cash" | "credit" | "bank") ?? "cash",
      notes: purchase.notes || "",
      items: normalizedItems,
      charges: normalizedCharges,
    });
  };

  const loadPurchaseDetail = async (purchaseId: number) => {
    return purchasesApi.get(purchaseId);
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

  const consumedOpenId = useRef<number | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const editParam = params.get("editId");
    if (editParam) {
      const id = Number(editParam);
      if (Number.isFinite(id) && consumedEditId.current !== id) {
        consumedEditId.current = id;
        handleEditById(id);
      }
      return;
    }
    const openParam = params.get("open");
    if (openParam) {
      const id = Number(openParam);
      if (Number.isFinite(id) && consumedOpenId.current !== id) {
        consumedOpenId.current = id;
        loadPurchaseDetail(id).then((detail) => {
          setMode("view");
          setCurrentPurchase(detail as any);
          setCurrentPurchaseId(id);
          populateFormFromPurchase(detail);
          openDialog("purchaseForm");
          window.history.replaceState({}, "", "/purchases");
        }).catch(() => {});
      }
    }
  }, [location]);
  const handleCloseDialog = () => {
    closeDialog("purchaseForm");
    setMode(null);
    resetPurchaseState();
    form.reset();
    setCustomProductDrafts({});
    setCreatingProductIndex(null);
    setLinkedGatePassId(null);
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
    const amount = Math.round((rate * billingQty + Number.EPSILON) * 100) / 100;
    return {
      grossWeight,
      netWeight,
      moundQty,
      moundRemainderKg,
      billingQty,
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
  const totalBardana = watchItems.reduce((sum, i) => sum + (parseFloat(i.bardanaKatKg) || 0), 0);
  const totalLess = watchItems.reduce((sum, i) => sum + (parseFloat(i.lessKg) || 0), 0);
  const totalWeightPerBag = totalBags > 0 ? totalNet / totalBags : 0;
  const totalMound = Math.floor(totalNet / moundBaseKg);
  const totalMoundRemainder = Math.max(totalNet - totalMound * moundBaseKg, 0);
  const qualityLessPerBag = totalBags > 0 ? totalLess / totalBags : 0;
  const accountantClerkCharges = watchCharges.reduce((sum, c) => {
    if (c.type !== "accountant_clerk") return sum;
    const amt = parseFloat(c.amount || "0") || 0;
    return sum + (c.mode === "less" ? -Math.abs(amt) : amt);
  }, 0);
  const chargeLabelMap: Record<string, string> = {
    weight: "Weight Charges",
    freight: "Freight",
    loading_filling: "Unloading Charges",
    market_fee: "Market Fee",
    mitha_sukri: "Mitha Sukri",
    other: "Other Charges",
    phone_analysis: "Phone / Analysis",
    brokerage: "Brokerage",
    commission: "Commission",
    bardana: bardanaLabel,
    broken_allowance: "Broken Allowance",
    accountant_clerk: "Accountant / Clerk",
  };
  const chargeBreakdown = watchCharges
    .map((c) => {
      const amt = parseFloat(c.amount || "0") || 0;
      return {
        label: chargeLabelMap[c.type] || c.type,
        mode: c.mode,
        amount: amt,
      };
    })
    .filter((c) => c.amount !== 0);
  const amountInWords = useMemo(() => `${numberToWords(Math.round(grandAmount))} only`, [grandAmount]);
  const isViewMode = purchaseMode === "view";
  const balanceDue = grandAmount - (parseFloat(form.watch("paidAmount") || "0") || 0);
  const chargeLabels: Record<string, string> = {
    weight: "Weight Charges",
    freight: "Freight",
    loading_filling: "Unloading Charges",
    market_fee: "Market Fee",
    mitha_sukri: "Mitha Sukri",
    other: "Other Charges",
    phone_analysis: "Phone / Analysis",
    brokerage: "Brokerage",
    commission: "Commission",
    bardana: bardanaLabel,
    broken_allowance: "Broken Allowance",
    accountant_clerk: "Accountant / Clerk",
  };

  return (
    <>
      <PurchasesList
        purchases={purchasesWithSupplier}
        isLoading={isLoading}
        onAddNew={handleAddNew}
        onView={handleView}
        onEdit={handleEdit}
        onDelete={handleDelete}
        isDeleting={deleteMutation.isPending}
        t={t as (key: string) => string}
      />

      <Dialog
        open={isDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleCloseDialog();
          }
        }}
      >
        <DialogContent bare={!isViewMode} className={isViewMode ? "sm:max-w-3xl" : "max-w-none"}>
          <DialogHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="space-y-1">
                <DialogTitle className={`text-xl tracking-tight ${isRTL ? "font-urdu" : ""}`}>
                  {purchaseMode === "view" ? "Purchase View" : purchaseMode === "edit" ? "Edit Purchase" : "New Purchase"}
                </DialogTitle>
                {purchaseMode !== "view" && (
                  <p className="text-sm text-muted-foreground">
                    Bill <span className="font-mono">{form.watch("billNo") || nextBill?.billNo || "Auto"}</span> · {form.watch("purchaseDate")}
                  </p>
                )}
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
            <form onSubmit={form.handleSubmit(handleSubmit)}>
              {purchaseMode !== "view" && (
                <div className="space-y-6">
                  {/* Entry: what you type, top to bottom in the order the paperwork arrives. */}
                    <FormSection title={`${t("supplier")} & ${t("vehicleNumber")}`}>
                      {purchaseMode === "create" && (
                        <div className="space-y-2 rounded-lg border border-dashed bg-muted/30 p-3">
                          <label htmlFor="linked-gate-pass" className="text-sm font-medium">{t("startFromGatePass")}</label>
                          <div className="flex gap-2">
                            <Select
                              value={linkedGatePassId ? String(linkedGatePassId) : "none"}
                              onValueChange={(value) => setLinkedGatePassId(value === "none" ? null : Number(value))}
                            >
                              <SelectTrigger id="linked-gate-pass" data-testid="select-linked-gate-pass" className="flex-1 bg-card">
                                <SelectValue placeholder={t("selectGatePass")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">None</SelectItem>
                                {openInPasses.map((pass) => (
                                  <SelectItem key={pass.id} value={String(pass.id)}>
                                    {pass.number} · {pass.vehicleNo || "-"} · {pass.partyName || "-"} · {pass.totalBags} {t("bags")}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {linkedGatePassId != null && (
                              <Button type="button" variant="outline" onClick={() => setLinkedGatePassId(null)}>
                                Clear
                              </Button>
                            )}
                          </div>
                          {openInPasses.length === 0 && <p className="text-xs text-muted-foreground">{t("noOpenPasses")}</p>}
                        </div>
                      )}
                      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        <FormField
                          control={form.control}
                          name="supplierId"
                          render={({ field }) => (
                            <FormItem className="sm:col-span-2 lg:col-span-1">
                              <FormLabel>{t("supplier")}</FormLabel>
                              <SearchableSelect
                                options={suppliers.map((s) => ({ value: s.id.toString(), label: s.name, sublabel: s.nameUrdu || undefined }))}
                                value={field.value || undefined}
                                onValueChange={field.onChange}
                                placeholder="Select supplier"
                                searchPlaceholder="Search supplier..."
                                emptyMessage="No suppliers found."
                                autoFocus
                              />
                              <FormMessage />
                            </FormItem>
                          )}
                        />
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
                                <Input {...field} placeholder="ABC-1234" data-testid="input-vehicle" readOnly={linkedGatePassId != null} />
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
                              <FormLabel>
                                {t("broker")} <span className="font-normal text-muted-foreground">(optional)</span>
                              </FormLabel>
                              <SearchableSelect
                                options={[
                                  { value: "none", label: "None" },
                                  ...suppliers.map((s) => ({ value: s.id.toString(), label: s.name, sublabel: s.nameUrdu || undefined })),
                                ]}
                                value={field.value || undefined}
                                onValueChange={field.onChange}
                                placeholder="Select broker"
                                searchPlaceholder="Search broker..."
                                emptyMessage="No brokers found."
                              />
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
                                <Input {...field} type="number" inputMode="decimal" step="0.01" className="tabular-nums" data-testid="input-commission" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                          <FormField
                            control={form.control}
                            name="billNo"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Bill No</FormLabel>
                                <FormControl>
                                  <Input {...field} placeholder={nextBill?.billNo || "Auto"} readOnly className="bg-muted/50 font-mono" />
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
                      </div>
                    </FormSection>

                    <FormSection title="Items" description={`${fields.length} ${fields.length === 1 ? "line" : "lines"} · ${totalNet.toFixed(2)} kg net`}>
                      {/* Full page width + fixed columns: fits a laptop screen without sideways scrolling. */}
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[880px] table-fixed text-sm">
                          <colgroup>
                            <col className="w-9" />
                            <col />
                            <col className="w-[7%]" />
                            <col className="w-[7%]" />
                            <col className="w-[7%]" />
                            <col className="w-[7%]" />
                            <col className="w-[7%]" />
                            <col className="w-[15%]" />
                            <col className="w-[11%]" />
                            <col className="w-10" />
                          </colgroup>
                          <thead className="border-b bg-muted/50 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                            <tr className="[&>th]:whitespace-nowrap [&>th]:px-2 [&>th]:py-2.5">
                              <th className="text-start">#</th>
                              <th className="text-start">Product</th>
                              <th className="text-end">Bags</th>
                              <th className="text-end" title="Filling per bag (kg)">Filling kg</th>
                              <th className="text-end" title="Loose kgs">Loose kg</th>
                              <th className="text-end" title={lessLabel}>
                                <abbr className="no-underline">Kaat kg</abbr>
                              </th>
                              <th className="text-end" title={bardanaLabel}>
                                <abbr className="no-underline">Bardana</abbr>
                              </th>
                              <th className="text-end">Rate / unit</th>
                              <th className="text-end">Amount</th>
                              <th>
                                <span className="sr-only">{t("actions")}</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {fields.map((field, index) => {
                              const computed = computedItems[index];
                              const num = (name: "bags" | "fillingPerBagKg" | "looseKgs" | "lessKg" | "bardanaKatKg", label: string, step = "0.01", testId?: string) => (
                                <td className="px-1 py-1.5">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.${name}`}
                                    render={({ field }) => (
                                      <FormItem className="space-y-1">
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            inputMode="decimal"
                                            step={step}
                                            onFocus={(e) => e.currentTarget.select()}
                                            aria-label={`${label}, line ${index + 1}`}
                                            className="h-9 px-2 text-end tabular-nums"
                                            data-testid={testId}
                                          />
                                        </FormControl>
                                        <FormMessage className="text-[11px]" />
                                      </FormItem>
                                    )}
                                  />
                                </td>
                              );
                              return (
                                <tr key={field.id} className="align-top transition-colors hover:bg-muted/30">
                                  <td className="px-2 py-3.5 text-xs tabular-nums text-muted-foreground">{index + 1}</td>
                                  <td className="px-1 py-1.5">
                                    <FormField
                                      control={form.control}
                                      name={`items.${index}.productId`}
                                      render={({ field }) => (
                                        <FormItem className="space-y-1">
                                          <Select onValueChange={field.onChange} value={field.value ?? ""}>
                                            <FormControl>
                                              <SelectTrigger className="h-9" aria-label={`Product, line ${index + 1}`} data-testid={`select-product-${index}`}>
                                                <SelectValue placeholder="Select product" />
                                              </SelectTrigger>
                                            </FormControl>
                                            <SelectContent>
                                              {/* Purchases are raw stock; keep an old non-raw pick visible on edit. */}
                                              {products.filter((p) => p.productType === "raw" || p.id.toString() === field.value).map((p) => (
                                                <SelectItem key={p.id} value={p.id.toString()}>
                                                  {p.name}
                                                  {p.nameUrdu ? ` (${p.nameUrdu})` : ""}
                                                </SelectItem>
                                              ))}
                                            </SelectContent>
                                          </Select>
                                          <FormMessage className="text-[11px]" />
                                        </FormItem>
                                      )}
                                    />
                                  </td>
                                  {num("bags", "Bags", "1", `input-bags-${index}`)}
                                  {num("fillingPerBagKg", "Filling per bag kg")}
                                  {num("looseKgs", "Loose kgs")}
                                  {num("lessKg", lessLabel)}
                                  {num("bardanaKatKg", bardanaLabel)}
                                  {/* Rate and its unit read as one value: "2,450 / Maund". */}
                                  <td className="px-1 py-1.5">
                                    <div className="flex rounded-md shadow-xs">
                                      <FormField
                                        control={form.control}
                                        name={`items.${index}.rate`}
                                        render={({ field }) => (
                                          <FormItem className="min-w-0 flex-1 space-y-1">
                                            <FormControl>
                                              <Input
                                                {...field}
                                                type="number"
                                                inputMode="decimal"
                                                step="0.01"
                                                onFocus={(e) => e.currentTarget.select()}
                                                aria-label={`Rate, line ${index + 1}`}
                                                className="h-9 rounded-e-none px-2 text-end tabular-nums focus-visible:z-10"
                                                data-testid={`input-rate-${index}`}
                                              />
                                            </FormControl>
                                            <FormMessage className="text-[11px]" />
                                          </FormItem>
                                        )}
                                      />
                                      <FormField
                                        control={form.control}
                                        name={`items.${index}.rateUnit`}
                                        render={({ field }) => (
                                          <FormItem className="space-y-1">
                                            <Select onValueChange={field.onChange} value={field.value ?? "kg"}>
                                              <FormControl>
                                                <SelectTrigger
                                                  className="h-9 w-[4.75rem] gap-1 rounded-s-none border-s-0 bg-muted/50 px-2 text-xs"
                                                  aria-label={`Rate unit, line ${index + 1}`}
                                                >
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
                                          </FormItem>
                                        )}
                                      />
                                    </div>
                                  </td>
                                  {/* Computed, so plain text, not a disabled input. */}
                                  <td className="px-2 py-1.5 text-end">
                                    <div className="pt-1 font-semibold tabular-nums">
                                      {(computed?.amount ?? 0).toLocaleString("en-PK", { maximumFractionDigits: 2 })}
                                    </div>
                                    <div className="text-[11px] tabular-nums text-muted-foreground">{(computed?.netWeight ?? 0).toFixed(2)} kg net</div>
                                  </td>
                                  <td className="px-1 py-1.5">
                                    {fields.length > 1 && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                                        onClick={() => remove(index)}
                                        data-testid={`button-remove-item-${index}`}
                                        aria-label={`${t("removeLine")} ${index + 1}`}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                          {fields.length > 1 && (
                            <tfoot className="border-t bg-muted/30 text-xs font-medium">
                              <tr className="[&>td]:px-2 [&>td]:py-2">
                                <td />
                                <td className="text-muted-foreground">Total</td>
                                <td className="text-end tabular-nums">{totalBags.toLocaleString()}</td>
                                <td colSpan={4} />
                                <td />
                                <td className="text-end">
                                  <div className="text-sm font-semibold tabular-nums">{subtotal.toLocaleString("en-PK", { maximumFractionDigits: 2 })}</div>
                                  <div className="tabular-nums text-muted-foreground">{totalNet.toFixed(2)} kg net</div>
                                </td>
                                <td />
                              </tr>
                            </tfoot>
                          )}
                        </table>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        className="w-full border-dashed bg-transparent text-muted-foreground hover:text-foreground"
                        onClick={() => append({ productId: "", bags: "0", fillingPerBagKg: "0", looseKgs: "0", lessKg: "0", bardanaKatKg: "0", rate: "0", rateUnit: "mound" })}
                        data-testid="button-add-item"
                      >
                        <Plus className="h-4 w-4" /> {t("add")} item
                      </Button>
                    </FormSection>

                  <div className="grid gap-8 border-t pt-6 lg:grid-cols-[minmax(0,1fr)_340px]">
                  <div className="min-w-0 space-y-6">
                    <FormSection title="Charges" description="Added to or deducted from the bill, posted to the chosen account.">
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[560px] text-sm">
                          <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            <tr>
                              <th className="px-3 py-2 text-start">Charge</th>
                              <th className="w-32 px-2 py-2 text-end">Amount</th>
                              <th className="w-28 px-2 py-2 text-start">Add / Less</th>
                              <th className="w-48 px-2 py-2 text-start">Account</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {chargeFields.map((charge, idx) => {
                              const label = chargeLabels[charge.type] || charge.type;
                              return (
                                <tr key={charge.id}>
                                  <td className="px-3 py-1.5 font-medium">{label}</td>
                                  <td className="px-1.5 py-1.5">
                                    <FormField
                                      control={form.control}
                                      name={`charges.${idx}.amount`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <FormControl>
                                            <Input {...field} type="number" inputMode="decimal" step="0.01" aria-label={`${label} amount`} className="h-9 text-end tabular-nums" />
                                          </FormControl>
                                        </FormItem>
                                      )}
                                    />
                                  </td>
                                  <td className="px-1.5 py-1.5">
                                    <FormField
                                      control={form.control}
                                      name={`charges.${idx}.mode`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <Select onValueChange={field.onChange} value={field.value}>
                                            <FormControl>
                                              <SelectTrigger className="h-9" aria-label={`${label} add or less`}>
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
                                  </td>
                                  <td className="px-1.5 py-1.5">
                                    <FormField
                                      control={form.control}
                                      name={`charges.${idx}.accountId`}
                                      render={({ field }) => (
                                        <FormItem>
                                          <Select onValueChange={field.onChange} value={field.value ?? "none"}>
                                            <FormControl>
                                              <SelectTrigger className="h-9" aria-label={`${label} account`}>
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
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </FormSection>

                    <FormSection title="Notes">
                      <FormField
                        control={form.control}
                        name="notes"
                        render={({ field }) => (
                          <FormItem>
                            <FormControl>
                              <Textarea {...field} rows={2} aria-label="Notes" placeholder="Anything worth remembering about this purchase" data-testid="input-notes" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </FormSection>
                  </div>

                  {/* Summary: stays in view while the items and charges above change. */}
                  <aside className="space-y-5 border-t pt-6 lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
                    <div className="space-y-4">
                      <h3 className="text-sm font-semibold">Summary</h3>
                      <dl className="space-y-1.5 text-xs">
                        <SummaryRow label="Total bags" value={totalBags.toFixed(2)} />
                        <SummaryRow label="Gross weight" value={`${totalGross.toFixed(2)} kg`} />
                        <SummaryRow label={bardanaLabel} value={`${totalBardana.toFixed(2)} kg`} />
                        <SummaryRow label={lessLabel} value={`${totalLess.toFixed(2)} kg`} />
                        <SummaryRow label={qualityLessPerBagLabel} value={`${qualityLessPerBag.toFixed(2)} kg`} />
                        <SummaryRow label="Weight per bag" value={`${totalWeightPerBag.toFixed(2)} kg`} />
                        <SummaryRow label="Net weight" value={`${totalNet.toFixed(2)} kg`} className="text-sm" />
                        <SummaryRow label={`Maund (${moundBaseKg} kg)`} value={`${totalMound} + ${totalMoundRemainder.toFixed(2)} kg`} />
                        <SummaryRow
                          label="Billed quantity"
                          value={formatQtyByUnit(computedItems.map((c, i) => ({ qty: c.billingQty, unit: watchItems[i]?.rateUnit })))}
                          className="text-sm"
                        />
                      </dl>
                      <dl className="space-y-1.5 border-t pt-3 text-xs">
                        <SummaryRow label={t("subtotal")} value={formatMoney(subtotal)} className="text-sm" />
                        <SummaryRow label="Commission" value={formatMoney(commissionAmount)} />
                        <SummaryRow label="Accountant / Clerk" value={formatMoney(accountantClerkCharges)} />
                        {chargeBreakdown.map((charge, index) => (
                          <SummaryRow
                            key={`${charge.label}-${index}`}
                            label={charge.label}
                            value={`${charge.mode === "less" ? "− " : "+ "}${formatMoney(charge.amount)}`}
                          />
                        ))}
                        <SummaryRow label="Charges added" value={`+ ${formatMoney(chargesAdd)}`} />
                        <SummaryRow label="Charges deducted" value={`− ${formatMoney(chargesLess)}`} />
                      </dl>
                      <div className="space-y-1 border-t pt-3">
                        <p className="text-xs font-medium text-muted-foreground">Grand amount</p>
                        <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(grandAmount)}</p>
                        <p className="text-xs capitalize text-muted-foreground">{amountInWords}</p>
                      </div>
                    </div>

                    <div className="space-y-4 border-t pt-5">
                      <h3 className="text-sm font-semibold">Payment</h3>
                      <FormField
                        control={form.control}
                        name="paidAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("paidAmount")}</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" inputMode="decimal" step="0.01" className="tabular-nums" data-testid="input-paid" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="paymentMode"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Payment Mode</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Payment mode" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="cash">Cash</SelectItem>
                                <SelectItem value="credit">Credit</SelectItem>
                                <SelectItem value="bank">Bank Transfer</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <dl className="text-sm">
                        <SummaryRow
                          label="Balance due"
                          value={formatMoney(balanceDue)}
                          className={balanceDue > 0 ? "[&>dd]:text-destructive" : "[&>dd]:text-primary"}
                        />
                      </dl>
                    </div>
                  </aside>
                  </div>
                </div>
              )}

              {purchaseMode === "view" && currentPurchase && (
                <Card className="border bg-muted/40">
                  <CardContent className="pt-4 space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-xs text-muted-foreground">Invoice #</p>
                        <p className="font-mono font-medium">{currentPurchase.invoiceNumber}</p>
                      </div>
                      <div className="text-end">
                        <p className="text-xs text-muted-foreground">Date</p>
                        <p className="font-medium">
                          {currentPurchase.purchaseDate ? format(new Date(currentPurchase.purchaseDate), "dd MMM yyyy") : "-"}
                        </p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-muted-foreground">Supplier</p>
                        {/* The detail endpoint returns supplierId only, so resolve the name here. */}
                        {(() => {
                          const supplier = suppliers.find((s) => s.id === Number(currentPurchase.supplierId));
                          return (
                            <>
                              <p className="font-medium">{supplier?.name || "-"}</p>
                              {supplier?.nameUrdu && <p className="text-sm text-muted-foreground font-urdu">{supplier.nameUrdu}</p>}
                            </>
                          );
                        })()}
                      </div>
                      <div className="text-end">
                        <p className="text-xs text-muted-foreground">Vehicle</p>
                        <p className="font-mono">{currentPurchase.vehicleNumber || "-"}</p>
                      </div>
                    </div>
                    {currentPurchase.gatePasses && currentPurchase.gatePasses.length > 0 && (
                      <div>
                        <p className="text-xs text-muted-foreground">{t("gatePassNumber")}</p>
                        <div className="flex flex-wrap gap-2">
                          {currentPurchase.gatePasses.map((pass) => (
                            <Link key={pass.id} href={`/gate-passes/${pass.id}`} className="font-mono text-sm text-primary hover:underline">
                              {pass.number}
                            </Link>
                          ))}
                        </div>
                      </div>
                    )}
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
                      <div className="border rounded-md p-3 bg-card">
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
                            <p className="text-muted-foreground text-xs">{lessLabel} (kg)</p>
                            <p className="font-mono">{currentPurchase.items[0].lessKg}</p>
                          </div>
                          <div>
                            <p className="text-muted-foreground text-xs">{bardanaLabel} (kg)</p>
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
                    <div>
                      <p className="text-xs text-muted-foreground">Total Amount</p>
                      <p className="font-mono font-semibold">{formatMoney(currentPurchase.totalAmount || 0)}</p>
                    </div>
                  </CardContent>
                </Card>
              )}

              {purchaseMode !== "view" && (
                <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                  <div className="flex flex-1 flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                    <span>
                      <span className="text-muted-foreground">Grand amount </span>
                      <span className="font-semibold tabular-nums">{formatMoney(grandAmount)}</span>
                    </span>
                    <span>
                      <span className="text-muted-foreground">Balance due </span>
                      <span className={`font-semibold tabular-nums ${balanceDue > 0 ? "text-destructive" : "text-primary"}`}>{formatMoney(balanceDue)}</span>
                    </span>
                  </div>
                  <Button type="button" variant="outline" onClick={handleCloseDialog}>
                    {t("cancel")}
                  </Button>
                  <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                    <Calculator className="h-4 w-4" />
                    {createMutation.isPending || updateMutation.isPending ? t("loading") : t("save")}
                  </Button>
                </div>
              )}
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
