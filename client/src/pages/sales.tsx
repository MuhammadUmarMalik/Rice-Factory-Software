import { Suspense, lazy, useEffect, useMemo, useRef, useState } from "react";
import { Plus, Eye, Truck, FileText, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { FormSection, SummaryRow } from "@/components/form-section";
import { formatMoney } from "@/utils/formatters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";
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
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Link, useLocation } from "wouter";
import type { Sale, Account, Product, SaleDispatchProgress } from "@/types/schema";
import { formatQtyByUnit, formatStock, unitToKg } from "@/lib/units";
import { useSaleDispatchSummary } from "@/hooks/use-gate-passes";
import { format } from "date-fns";
import { confirmAction } from "@/components/confirm-dialog";

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

const toQuantityKg = (quantity: number, unit: string) => unitToKg(quantity, unit);

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

/**
 * Dispatched vs pending badge for a sale. Uses the roll-up the list endpoint
 * attaches (`dispatch`), so the table needs no extra request per row.
 */
function DispatchBadge({ dispatch }: { dispatch?: SaleDispatchProgress | null }) {
  const { t } = useLanguage();
  if (!dispatch) return <span className="text-sm text-muted-foreground">-</span>;
  const label =
    dispatch.status === "fully_dispatched"
      ? t("fullyDispatched")
      : dispatch.status === "partly_dispatched"
        ? t("partlyDispatched")
        : t("notDispatched");
  const variant =
    dispatch.status === "fully_dispatched"
      ? ("default" as const)
      : dispatch.status === "partly_dispatched"
        ? ("secondary" as const)
        : ("outline" as const);
  return (
    <div className="flex flex-col gap-1">
      <Badge variant={variant}>{label}</Badge>
      <span className="text-xs text-muted-foreground font-mono">
        {dispatch.dispatchedBags}
        {dispatch.orderedBags != null ? ` / ${dispatch.orderedBags}` : ""}
      </span>
    </div>
  );
}

// A sale's party is an account of one of these types; its ledger takes the sale.
const PARTY_TYPES = [
  { value: "customer", label: "Customer", labelUrdu: "گاہک" },
  { value: "supplier", label: "Supplier", labelUrdu: "سپلائر" },
  { value: "employee", label: "Employee", labelUrdu: "ملازم" },
] as const;
type PartyType = (typeof PARTY_TYPES)[number]["value"];

const saleFormSchema = z.object({
  saleDate: z.string().optional().refine((val) => !val || !isFutureDateString(val), {
    message: "Date cannot be in the future",
  }),
  dueDate: z.string().optional(),
  partyType: z.enum(["customer", "supplier", "employee"]).default("customer"),
  customerId: z.string().min(1, "Party is required"),
  vehicleNumber: z.string().optional(),
  marka: z.string().optional(),
  loadingCharges: z.string().default("0"),
  loadingChargesMode: z.enum(["add", "less"]).default("add"),
  weighingCharges: z.string().default("0"),
  weighingChargesMode: z.enum(["add", "less"]).default("add"),
  otherCharges: z.string().default("0"),
  otherChargesMode: z.enum(["add", "less"]).default("add"),
  rentCharges: z.string().default("0"),
  rentChargesMode: z.enum(["add", "less"]).default("add"),
  freightCharges: z.string().default("0"),
  freightChargesMode: z.enum(["add", "less"]).default("add"),
  discountAmount: z.string().default("0"),
  paidAmount: z.string().default("0"),
  paymentMode: z.enum(["cash", "credit", "bank"]).default("cash"),
  notes: z.string().optional(),
  items: z.array(z.object({
    productId: z.string().min(1, "Product is required"),
    quantity: z.string().min(1, "Quantity is required"),
    unit: z.string().min(1, "Unit is required"),
    pricePerUnit: z.string().min(1, "Price is required"),
  })).min(1, "At least one item is required"),
}).refine(
  (data) => !data.saleDate || !data.dueDate || parseLocalDate(data.dueDate) >= parseLocalDate(data.saleDate),
  { path: ["dueDate"], message: "Due date cannot be before the sale date" },
);

type SaleFormData = z.infer<typeof saleFormSchema>;

function mergeRentIntoFreight(sale: any) {
  const signed = (amount: unknown, mode: unknown) =>
    (mode === "less" ? -1 : 1) * (parseFloat(String(amount ?? "0")) || 0);
  const net = signed(sale.freightCharges, sale.freightChargesMode) + signed(sale.rentCharges, sale.rentChargesMode);
  const freightMode: "add" | "less" = net < 0 || (net === 0 && sale.freightChargesMode === "less") ? "less" : "add";
  return {
    freightCharges: String(Math.round(Math.abs(net) * 100) / 100),
    freightChargesMode: freightMode,
    rentCharges: "0",
    rentChargesMode: "add" as const,
  };
}

export default function SalesPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const todayString = formatDateInput(new Date());
  const { reference, detail, isLoading: isDetailLoading, openDetail, closeDetail } = useReportDetail();
  const openedFromUrl = useRef(false);
  useEffect(() => {
    if (openedFromUrl.current) return;
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const openId = params.get("open");
    if (openId) {
      const id = parseInt(openId, 10);
      if (!isNaN(id)) {
        openedFromUrl.current = true;
        openDetail({ type: "sale", id });
        window.history.replaceState({}, "", "/sales");
      }
    }
  }, [openDetail]);
  const unitOptions = [
    { value: "kg", label: "Kilogram (kg)" },
    { value: "mound", label: "Mound (40 kg)" },
    { value: "quintal", label: "Quintal (100 kg)" },
    { value: "ton", label: "Ton (1000 kg)" },
  ];

  const form = useForm<SaleFormData>({
    resolver: zodResolver(saleFormSchema),
    defaultValues: {
      saleDate: formatDateInput(new Date()),
      partyType: "customer",
      customerId: "",
      vehicleNumber: "",
      marka: "",
      loadingCharges: "0",
      loadingChargesMode: "add",
      weighingCharges: "0",
      weighingChargesMode: "add",
      otherCharges: "0",
      otherChargesMode: "add",
      rentCharges: "0",
      rentChargesMode: "add",
      freightCharges: "0",
      freightChargesMode: "add",
      discountAmount: "0",
      paidAmount: "0",
      paymentMode: "cash",
      notes: "",
      items: [{ productId: "", quantity: "", unit: "mound", pricePerUnit: "" }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const { data: sales = [], isLoading } = useQuery<(Sale & { customer?: Account })[]>({
    queryKey: ["/api/sales"],
  });

  const dispatchSummary = useSaleDispatchSummary(editingId);

  // One accounts query feeds all three party types.
  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });
  const [partyFilter, setPartyFilter] = useState<"all" | PartyType>("all");
  const watchPartyType = form.watch("partyType");
  const parties = useMemo(() => accounts.filter((a) => a.type === watchPartyType), [accounts, watchPartyType]);
  const partyTypeLabel = (type?: string | null) => {
    const match = PARTY_TYPES.find((p) => p.value === (type || "customer")) ?? PARTY_TYPES[0];
    return language === "ur" ? match.labelUrdu : match.label;
  };

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const salesWithCustomer = useMemo(() => {
    const accountMap = new Map(accounts.map((c) => [c.id, c]));
    return sales
      .filter((s) => partyFilter === "all" || (s.partyType || "customer") === partyFilter)
      .map((s) => ({
        ...s,
        customer: accountMap.get(typeof s.customerId === "string" ? parseInt(s.customerId) : s.customerId),
      }));
  }, [sales, accounts, partyFilter]);

  const getUnitForProduct = (productId?: string) =>
    products.find((p) => p.id.toString() === productId)?.unit;

  const createMutation = useMutation({
    mutationKey: ["/api/sales", "create"],
    meta: scopedInvalidation,
    mutationFn: (data: SaleFormData) =>
      apiRequest("POST", "/api/sales", {
        ...data,
        saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
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
      invalidateApi(invalidationGroups.sales);
      setIsDialogOpen(false);
      form.reset();
      setEditingId(null);
      toast({ title: t("savedSuccessfully") });
    },
  });

  const updateMutation = useMutation({
    mutationKey: ["/api/sales", "update"],
    meta: scopedInvalidation,
    mutationFn: ({ id, data }: { id: number; data: SaleFormData }) =>
      apiRequest("PATCH", `/api/sales/${id}`, {
        ...data,
        saleDate: data.saleDate ? new Date(data.saleDate) : undefined,
        dueDate: data.dueDate ? new Date(data.dueDate) : undefined,
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
      invalidateApi(invalidationGroups.sales);
      setIsDialogOpen(false);
      form.reset();
      setEditingId(null);
      toast({ title: t("savedSuccessfully") });
    },
  });

  const deleteMutation = useMutation({
    mutationKey: ["/api/sales", "delete"],
    meta: scopedInvalidation,
    mutationFn: (id: number) => apiRequest("DELETE", `/api/sales/${id}`),
    onSuccess: () => {
      invalidateApi(invalidationGroups.sales);
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

      const available = Number(product.currentStock);
      const requested = toQuantityKg(Number(item.quantity), item.unit);
      const avail = Number.isFinite(available) && available >= 0 ? available : 0;
      const req = Number.isFinite(requested) && requested >= 0 ? requested : 0;

      if (req > avail) {
        form.setError(`items.${index}.quantity`, { type: "manual", message: "Insufficient stock" });
        toast({
          variant: "destructive",
          title: language === "ur" ? "Insufficient stock" : "Insufficient stock",
          description: `${product.name} has only ${avail.toLocaleString()} kg available; this sale requires ${req.toLocaleString()} kg.`,
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
      dueDate: "",
      partyType: "customer",
      customerId: "",
      vehicleNumber: "",
      marka: "",
      loadingCharges: "0",
      loadingChargesMode: "add",
      weighingCharges: "0",
      weighingChargesMode: "add",
      otherCharges: "0",
      otherChargesMode: "add",
      rentCharges: "0",
      rentChargesMode: "add",
      freightCharges: "0",
      freightChargesMode: "add",
      discountAmount: "0",
      paidAmount: "0",
      paymentMode: "cash",
      notes: "",
      items: [{ productId: "", quantity: "", unit: "mound", pricePerUnit: "" }],
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
        dueDate: sale.dueDate ? format(new Date(sale.dueDate), "yyyy-MM-dd") : "",
        partyType: (sale.partyType as PartyType) || "customer",
        customerId: sale.customerId?.toString() || "",
        vehicleNumber: sale.vehicleNumber || "",
        marka: sale.marka || "",
        loadingCharges: sale.loadingCharges || "0",
        loadingChargesMode: (sale as any).loadingChargesMode || "add",
        weighingCharges: sale.weighingCharges || "0",
        weighingChargesMode: (sale as any).weighingChargesMode || "add",
        otherCharges: sale.otherCharges || "0",
        otherChargesMode: (sale as any).otherChargesMode || "add",
        // Rent and freight are the same charge; an old sale's rent is folded
        // into freight here (same net amount) and saved back as rent 0.
        ...mergeRentIntoFreight(sale),
        discountAmount: sale.discountAmount || "0",
        paidAmount: sale.paidAmount || "0",
        paymentMode: (sale.paymentMode as "cash" | "credit" | "bank") || "cash",
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

  const handleDelete = async (id: number) => {
    if (!(await confirmAction("Delete this sale? This will reverse stock and ledger impact."))) return;
    deleteMutation.mutate(id);
  };

  const watchItems = form.watch("items");
  const watchLoading = form.watch("loadingCharges");
  const watchLoadingMode = form.watch("loadingChargesMode");
  const watchWeighing = form.watch("weighingCharges");
  const watchWeighingMode = form.watch("weighingChargesMode");
  const watchOther = form.watch("otherCharges");
  const watchOtherMode = form.watch("otherChargesMode");
  const watchFreight = form.watch("freightCharges");
  const watchFreightMode = form.watch("freightChargesMode");
  const watchDiscount = form.watch("discountAmount");

  const subtotal = watchItems.reduce((sum, item) => {
    const qty = parseFloat(item.quantity) || 0;
    const price = parseFloat(item.pricePerUnit) || 0;
    return sum + (qty * price);
  }, 0);

  const chargesAdd = (
    (watchLoadingMode === "add" ? parseFloat(watchLoading) || 0 : 0) +
    (watchWeighingMode === "add" ? parseFloat(watchWeighing) || 0 : 0) +
    (watchOtherMode === "add" ? parseFloat(watchOther) || 0 : 0) +
    (watchFreightMode === "add" ? parseFloat(watchFreight) || 0 : 0)
  );
  const chargesLess = (
    (watchLoadingMode === "less" ? parseFloat(watchLoading) || 0 : 0) +
    (watchWeighingMode === "less" ? parseFloat(watchWeighing) || 0 : 0) +
    (watchOtherMode === "less" ? parseFloat(watchOther) || 0 : 0) +
    (watchFreightMode === "less" ? parseFloat(watchFreight) || 0 : 0)
  );
  const totalCharges = chargesAdd - chargesLess;
  const signed = (value: string, mode: string) => (mode === "less" ? -1 : 1) * (parseFloat(value) || 0);
  // Bardana + Loading + Stitching, listed one by one in the summary card.
  const chargesAddLessNamed =
    signed(watchWeighing, watchWeighingMode) + signed(watchLoading, watchLoadingMode) + signed(watchOther, watchOtherMode);
  const discount = parseFloat(watchDiscount) || 0;
  const totalAmount = Math.max(0, subtotal + totalCharges - discount);
  const balanceDue = totalAmount - (parseFloat(form.watch("paidAmount") || "0") || 0);
  const chargeFields = [
    { name: "weighingCharges", modeName: "weighingChargesMode", label: t("weighingCharges"), testId: "input-weighing" },
    { name: "loadingCharges", modeName: "loadingChargesMode", label: t("loadingCharges"), testId: "input-loading" },
    { name: "otherCharges", modeName: "otherChargesMode", label: t("otherCharges"), testId: "input-other" },
    { name: "freightCharges", modeName: "freightChargesMode", label: language === "ur" ? "کرایہ (فریٹ)" : "Freight", testId: undefined },
  ] as const;

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
      key: "dispatch",
      title: "Dispatch",
      titleUrdu: "روانگی",
      render: (item) => <DispatchBadge dispatch={item.dispatch} />,
    },
    {
      key: "customer",
      title: "Party",
      titleUrdu: "پارٹی",
      render: (item) => (
        <div>
          <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <p className="font-medium">{item.customer?.name || item.partyName || "-"}</p>
            <Badge variant={(item.partyType || "customer") === "customer" ? "secondary" : "outline"} className="text-xs">
              {partyTypeLabel(item.partyType)}
            </Badge>
          </div>
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
      key: "marka",
      title: "Marka",
      titleUrdu: "مارکہ",
      render: (item) => <span className="text-sm">{item.marka || "-"}</span>,
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
        const cashReceiptVoucherNo = (item as Sale & { cashReceiptVoucherNo?: string | null }).cashReceiptVoucherNo;
        return (
          <div className={`flex flex-col gap-1 items-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className={`flex items-center gap-2 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
              <span className="font-mono text-sm">Rs. {paid.toLocaleString()}</span>
              <Badge variant={isPaid ? "default" : "secondary"} className="text-xs">
                {isPaid ? (language === "ur" ? "مکمل" : "Paid") : (language === "ur" ? "باقی" : "Due")}
              </Badge>
            </div>
            {cashReceiptVoucherNo && (
              <Link href="/cash" className="text-xs text-primary hover:underline">
                {language === "ur" ? "کیش رسید" : "Cash receipt"}: {cashReceiptVoucherNo}
              </Link>
            )}
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
            title={t("createGatePass")}
            data-testid={`button-gate-pass-${item.id}`}
            onClick={() => setLocation(`/gate-passes/new?saleId=${item.id}&direction=OUT`)}
          >
            <Truck className="h-4 w-4" />
          </Button>
          <Button aria-label={t("view")}
            size="icon"
            variant="ghost"
            data-testid={`button-view-${item.id}`}
            onClick={() => openDetail({ type: "sale", id: item.id })}
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button aria-label={t("edit")}
            size="icon"
            variant="ghost"
            data-testid={`button-edit-${item.id}`}
            onClick={() => handleEdit(item.id)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button aria-label={t("delete")}
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
        <CardContent className="pt-6 space-y-4">
          <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <span className="text-sm text-muted-foreground">{language === "ur" ? "پارٹی کی قسم" : "Party Type"}</span>
            <Select value={partyFilter} onValueChange={(v) => setPartyFilter(v as "all" | PartyType)}>
              <SelectTrigger className="w-40" data-testid="filter-party-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{language === "ur" ? "تمام" : "All"}</SelectItem>
                {PARTY_TYPES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>
                    {language === "ur" ? p.labelUrdu : p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DataTable
            columns={columns}
            data={salesWithCustomer}
            isLoading={isLoading}
            testIdPrefix="sales"
          />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent bare className="max-w-none">
          <DialogHeader>
            <DialogTitle className={`text-xl tracking-tight ${isRTL ? "font-urdu" : ""}`}>
              {editingId
                ? (language === "ur" ? "فروخت میں ترمیم" : "Edit Sale")
                : (language === "ur" ? "نئی فروخت" : "New Sale")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)}>
              <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_300px] xl:grid-cols-[minmax(0,1fr)_340px]">
                <div className="min-w-0 space-y-6">
                  <FormSection title={language === "ur" ? "پارٹی" : "Party"}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <FormField
                        control={form.control}
                        name="partyType"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{language === "ur" ? "پارٹی کی قسم" : "Party Type"}</FormLabel>
                            <Select
                              value={field.value}
                              onValueChange={(value) => {
                                field.onChange(value);
                                // A party id only makes sense within its own type.
                                form.setValue("customerId", "", { shouldValidate: false });
                              }}
                            >
                              <FormControl>
                                <SelectTrigger data-testid="select-party-type">
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {PARTY_TYPES.map((p) => (
                                  <SelectItem key={p.value} value={p.value}>
                                    {language === "ur" ? p.labelUrdu : p.label}
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
                        name="customerId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{partyTypeLabel(watchPartyType)}</FormLabel>
                            <SearchableSelect
                              options={parties.map((c) => ({ value: c.id.toString(), label: c.name, sublabel: c.nameUrdu || undefined }))}
                              value={field.value || undefined}
                              onValueChange={field.onChange}
                              placeholder={`Select ${partyTypeLabel(watchPartyType).toLowerCase()}`}
                              searchPlaceholder={`Search ${partyTypeLabel(watchPartyType).toLowerCase()}...`}
                              emptyMessage={`No ${partyTypeLabel(watchPartyType).toLowerCase()} found.`}
                              autoFocus
                            />
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
                        name="dueDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("dueDate")}</FormLabel>
                            <FormControl>
                              <Input {...field} type="date" />
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
                        name="marka"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{language === "ur" ? "مارکہ" : "Marka"}</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="—" data-testid="input-marka" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>

                    {editingId != null && (
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed bg-muted/30 p-3">
                        <div className="space-y-1 text-sm">
                          <p className="flex items-center gap-2 font-medium">
                            <Truck className="h-4 w-4 text-muted-foreground" />
                            {t("dispatched")}
                          </p>
                          {dispatchSummary.data ? (
                            <>
                              <DispatchBadge
                                dispatch={{
                                  saleId: editingId,
                                  status: dispatchSummary.data.status,
                                  orderedKg: dispatchSummary.data.orderedKg,
                                  dispatchedKg: dispatchSummary.data.dispatchedKg,
                                  pendingKg: dispatchSummary.data.pendingKg,
                                  orderedBags: null,
                                  dispatchedBags: dispatchSummary.data.passes.reduce((sum, pass) => sum + pass.totalBags, 0),
                                }}
                              />
                              <p className="text-xs tabular-nums text-muted-foreground">
                                {t("ordered")}: {dispatchSummary.data.orderedKg.toFixed(2)} kg · {t("dispatched")}:{" "}
                                {dispatchSummary.data.dispatchedKg.toFixed(2)} kg · {t("remaining")}: {dispatchSummary.data.pendingKg.toFixed(2)} kg
                              </p>
                            </>
                          ) : (
                            <p className="text-xs text-muted-foreground">{t("loading")}</p>
                          )}
                        </div>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="bg-card"
                          onClick={() => setLocation(`/gate-passes/new?saleId=${editingId}&direction=OUT`)}
                          data-testid="button-create-gate-pass"
                        >
                          <Truck className="h-4 w-4" />
                          {t("createGatePass")}
                        </Button>
                      </div>
                    )}
                  </FormSection>

                  <FormSection
                    title={language === "ur" ? "آئٹمز" : "Items"}
                    description={`${fields.length} ${fields.length === 1 ? "line" : "lines"}`}
                  >
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[720px] text-sm">
                        <thead className="bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                          <tr>
                            <th className="w-8 px-2 py-2 text-start">#</th>
                            <th className="px-2 py-2 text-start">{language === "ur" ? "مصنوعات" : "Product"}</th>
                            <th className="w-28 px-2 py-2 text-end">{t("quantity")}</th>
                            <th className="w-32 px-2 py-2 text-start">Unit</th>
                            <th className="w-32 px-2 py-2 text-end">{t("pricePerUnit")}</th>
                            <th className="w-32 px-2 py-2 text-end">{t("amount")}</th>
                            <th className="w-10 px-2 py-2" aria-label={t("actions")} />
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {fields.map((row, index) => {
                            const item = watchItems[index];
                            const productId = item?.productId;
                            const unit = item?.unit || getUnitForProduct(productId) || "unit";
                            const product = products.find((p) => p.id.toString() === productId);
                            const lineAmount = (parseFloat(item?.quantity) || 0) * (parseFloat(item?.pricePerUnit) || 0);
                            return (
                              <tr key={row.id} className="align-top">
                                <td className="px-2 py-3.5 text-xs tabular-nums text-muted-foreground">{index + 1}</td>
                                <td className="px-1.5 py-1.5">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.productId`}
                                    render={({ field }) => (
                                      <FormItem className="space-y-1">
                                        <Select
                                          onValueChange={(value) => {
                                            field.onChange(value);
                                            const productUnit = getUnitForProduct(value);
                                            if (productUnit && !form.getValues(`items.${index}.unit`)) {
                                              form.setValue(`items.${index}.unit`, productUnit, { shouldValidate: true });
                                            }
                                          }}
                                          value={field.value}
                                        >
                                          <FormControl>
                                            <SelectTrigger className="h-9" aria-label={`Product, line ${index + 1}`} data-testid={`select-product-${index}`}>
                                              <SelectValue placeholder={language === "ur" ? "منتخب کریں" : "Select product"} />
                                            </SelectTrigger>
                                          </FormControl>
                                          <SelectContent>
                                            {/* Sales are bio (finished) stock; keep an old non-bio pick visible on edit. */}
                                            {products.filter((p) => p.productType === "bio" || p.id.toString() === field.value).map((p) => (
                                              <SelectItem key={p.id} value={p.id.toString()}>
                                                {p.name}
                                              </SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                        {/* Stock moved out of the option label so the chosen value stays short. */}
                                        {product && (
                                          <p className="px-1 text-xs tabular-nums text-muted-foreground">
                                            {formatStock(product.currentStock, product.unit)} in stock
                                          </p>
                                        )}
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </td>
                                <td className="px-1.5 py-1.5">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.quantity`}
                                    render={({ field }) => (
                                      <FormItem className="space-y-1">
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            aria-label={`${t("quantity")} (${unit}), line ${index + 1}`}
                                            className="h-9 text-end tabular-nums"
                                            data-testid={`input-quantity-${index}`}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </td>
                                <td className="px-1.5 py-1.5">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.unit`}
                                    render={({ field }) => (
                                      <FormItem className="space-y-1">
                                        <Select onValueChange={field.onChange} value={field.value}>
                                          <FormControl>
                                            <SelectTrigger className="h-9" aria-label={`Unit, line ${index + 1}`} data-testid={`select-unit-${index}`}>
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
                                </td>
                                <td className="px-1.5 py-1.5">
                                  <FormField
                                    control={form.control}
                                    name={`items.${index}.pricePerUnit`}
                                    render={({ field }) => (
                                      <FormItem className="space-y-1">
                                        <FormControl>
                                          <Input
                                            {...field}
                                            type="number"
                                            inputMode="decimal"
                                            step="0.01"
                                            aria-label={`${t("pricePerUnit")} (${unit}), line ${index + 1}`}
                                            className="h-9 text-end tabular-nums"
                                            data-testid={`input-price-${index}`}
                                          />
                                        </FormControl>
                                        <FormMessage />
                                      </FormItem>
                                    )}
                                  />
                                </td>
                                <td className="px-2 py-3.5 text-end font-medium tabular-nums">
                                  {lineAmount.toLocaleString("en-PK", { maximumFractionDigits: 2 })}
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
                      </table>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full border-dashed bg-transparent"
                      onClick={() => append({ productId: "", quantity: "", unit: "mound", pricePerUnit: "" })}
                      data-testid="button-add-item"
                    >
                      <Plus className="h-4 w-4" /> {t("add")} item
                    </Button>
                  </FormSection>

                  <FormSection title={language === "ur" ? "چارجز" : "Charges"}>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {chargeFields.map(({ name, modeName, label, testId }) => (
                        <FormField
                          key={name}
                          control={form.control}
                          name={name}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>{label}</FormLabel>
                              <div className="flex gap-2">
                                <FormControl>
                                  <Input {...field} type="number" inputMode="decimal" step="0.01" placeholder="0" className="tabular-nums" data-testid={testId} />
                                </FormControl>
                                <Select value={form.watch(modeName)} onValueChange={(v) => form.setValue(modeName, v as "add" | "less")}>
                                  <SelectTrigger className="w-24 shrink-0" aria-label={`${label} add or less`}>
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="add">Add</SelectItem>
                                    <SelectItem value="less">Less</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                      <FormField
                        control={form.control}
                        name="discountAmount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t("discountAmount")}</FormLabel>
                            <FormControl>
                              <Input {...field} type="number" inputMode="decimal" step="0.01" min="0" className="tabular-nums" data-testid="input-discount" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  </FormSection>

                  <FormSection title={language === "ur" ? "نوٹس" : "Notes"}>
                    <FormField
                      control={form.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem>
                          <FormControl>
                            <Textarea {...field} rows={2} aria-label={language === "ur" ? "نوٹس" : "Notes"} data-testid="input-notes" />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </FormSection>
                </div>

                <aside className="space-y-5 border-t pt-6 lg:sticky lg:top-16 lg:self-start lg:border-s lg:border-t-0 lg:ps-6 lg:pt-0">
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold">{language === "ur" ? "خلاصہ" : "Summary"}</h3>
                    <dl className="space-y-1.5 text-xs">
                      <SummaryRow
                        label={t("quantity")}
                        value={formatQtyByUnit(watchItems.map((item) => ({ qty: parseFloat(item.quantity) || 0, unit: item.unit })))}
                        className="text-sm"
                      />
                      <SummaryRow
                        label={language === "ur" ? "کل وزن" : "Total weight"}
                        value={`${watchItems.reduce((sum, item) => sum + toQuantityKg(parseFloat(item.quantity) || 0, item.unit), 0).toFixed(2)} kg`}
                      />
                      <SummaryRow label={t("subtotal")} value={formatMoney(subtotal)} className="text-sm" />
                      {([
                        [t("weighingCharges"), watchWeighing, watchWeighingMode],
                        [t("loadingCharges"), watchLoading, watchLoadingMode],
                        [t("otherCharges"), watchOther, watchOtherMode],
                      ] as const).map(([label, value, mode]) => (
                        <SummaryRow key={label} label={label} value={`${mode === "less" ? "− " : "+ "}${formatMoney(parseFloat(value) || 0)}`} />
                      ))}
                      {totalCharges !== chargesAddLessNamed && (
                        <SummaryRow label={language === "ur" ? "کرایہ (فریٹ)" : "Freight"} value={formatMoney(totalCharges - chargesAddLessNamed)} />
                      )}
                      {discount > 0 && <SummaryRow label={t("discountAmount")} value={`− ${formatMoney(discount)}`} />}
                    </dl>
                    <div className="space-y-1 border-t pt-3">
                      <p className="text-xs font-medium text-muted-foreground">{t("total")}</p>
                      <p className="text-2xl font-semibold tracking-tight tabular-nums">{formatMoney(totalAmount)}</p>
                    </div>
                  </div>

                  <div className="space-y-4 border-t pt-5">
                    <h3 className="text-sm font-semibold">{language === "ur" ? "ادائیگی" : "Payment"}</h3>
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
                        label={language === "ur" ? "باقی رقم" : "Balance due"}
                        value={formatMoney(balanceDue)}
                        className={balanceDue > 0 ? "[&>dd]:text-destructive" : "[&>dd]:text-primary"}
                      />
                    </dl>
                  </div>
                </aside>
              </div>

              <div className="sticky bottom-0 z-10 -mx-4 mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 border-t bg-background/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
                <div className="flex flex-1 flex-wrap items-baseline gap-x-6 gap-y-1 text-sm">
                  <span>
                    <span className="text-muted-foreground">{t("total")} </span>
                    <span className="font-semibold tabular-nums">{formatMoney(totalAmount)}</span>
                  </span>
                  <span>
                    <span className="text-muted-foreground">{language === "ur" ? "باقی رقم" : "Balance due"} </span>
                    <span className={`font-semibold tabular-nums ${balanceDue > 0 ? "text-destructive" : "text-primary"}`}>{formatMoney(balanceDue)}</span>
                  </span>
                </div>
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
