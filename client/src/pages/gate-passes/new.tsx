import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { ArrowLeft, Plus, Trash2, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/hooks/use-toast";
import { useAccounts, useProducts } from "@/hooks";
import { useCreateGatePass, useSaleDispatchSummary } from "@/hooks/use-gate-passes";
import { useQuery } from "@tanstack/react-query";
import type { Processing, Sale } from "@/types/schema";

type Direction = "IN" | "OUT";
type SourceType = "" | "SALE" | "JOB_RETURN";

type ItemDraft = {
  key: string;
  productId: string;
  bags: string;
  weightKg: string;
  saleItemId?: number;
};

function newItem(): ItemDraft {
  return {
    key: Math.random().toString(36).slice(2),
    productId: "",
    bags: "0",
    weightKg: "0",
  };
}

function toNumber(value: string): number {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}

function kgToGrams(kg: string): number {
  return Math.round(toNumber(kg) * 1000);
}

function errorMessage(error: unknown): string {
  if (!error) return "Something went wrong";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong";
}

export default function NewGatePassPage() {
  const { t, language, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const initial = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    const direction = params.get("direction") === "OUT" ? "OUT" : "IN";
    const saleId = params.get("saleId") || "";
    return { direction: direction as Direction, saleId };
  }, []);

  const [direction, setDirection] = useState<Direction>(initial.direction);
  const [vehicleNo, setVehicleNo] = useState("");
  const [driverName, setDriverName] = useState("");
  const [driverPhone, setDriverPhone] = useState("");
  const [partyId, setPartyId] = useState("");
  const [sourceType, setSourceType] = useState<SourceType>(
    initial.direction === "OUT" && initial.saleId ? "SALE" : "",
  );
  const [saleId, setSaleId] = useState(initial.saleId);
  const [processingId, setProcessingId] = useState("");
  const [items, setItems] = useState<ItemDraft[]>([newItem()]);
  const [gross, setGross] = useState("");
  const [tare, setTare] = useState("");
  const [remarks, setRemarks] = useState("");

  const { data: products = [] } = useProducts();
  const { data: parties = [] } = useAccounts({
    type: direction === "IN" ? "supplier" : "customer",
  });
  const { data: sales = [] } = useQuery<Sale[]>({ queryKey: ["/api/sales"] });
  const { data: batches = [] } = useQuery<Processing[]>({
    queryKey: ["/api/processing"],
    enabled: direction === "OUT",
  });

  const dispatchSummary = useSaleDispatchSummary(
    direction === "OUT" && sourceType === "SALE" && saleId ? Number(saleId) : null,
  );

  // Prefill the line items from the selected sale's pending dispatch amounts.
  useEffect(() => {
    if (direction !== "OUT" || sourceType !== "SALE") return;
    const summary = dispatchSummary.data;
    if (!summary) return;
    setItems(
      summary.items
        .filter((line) => line.pendingKg > 0)
        .map((line) => ({
          key: Math.random().toString(36).slice(2),
          productId: String(line.productId),
          bags:
            line.orderedBags != null
              ? String(Math.max(line.orderedBags - line.dispatchedBags, 0))
              : "0",
          weightKg: String(line.pendingKg),
        })),
    );
  }, [dispatchSummary.data, direction, sourceType]);

  const netKg = useMemo(() => {
    if (gross === "" || tare === "") return "";
    return String(Math.max(toNumber(gross) - toNumber(tare), 0));
  }, [gross, tare]);

  const totalBags = items.reduce((sum, item) => sum + toNumber(item.bags), 0);
  const totalWeightKg = items.reduce((sum, item) => sum + toNumber(item.weightKg), 0);

  // Live over-dispatch check against the sale's remaining quantity, per product.
  const overDispatch = useMemo(() => {
    const summary = dispatchSummary.data;
    if (!summary) return [] as Array<{ productId: number; remaining: number; entered: number }>;
    const enteredByProduct = new Map<number, number>();
    for (const item of items) {
      const pid = Number(item.productId);
      if (!pid) continue;
      enteredByProduct.set(pid, (enteredByProduct.get(pid) ?? 0) + toNumber(item.weightKg));
    }
    const result: Array<{ productId: number; remaining: number; entered: number }> = [];
    for (const line of summary.items) {
      const entered = enteredByProduct.get(line.productId) ?? 0;
      if (entered - line.pendingKg > 0.0001) {
        result.push({ productId: line.productId, remaining: line.pendingKg, entered });
      }
    }
    return result;
  }, [dispatchSummary.data, items]);

  const createMutation = useCreateGatePass();

  const updateItem = (key: string, patch: Partial<ItemDraft>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const handleSave = () => {
    const validItems = items
      .filter((item) => item.productId && (toNumber(item.weightKg) > 0 || toNumber(item.bags) > 0))
      .map((item) => ({
        productId: Number(item.productId),
        bags: Math.round(toNumber(item.bags)),
        weightG: kgToGrams(item.weightKg),
        saleItemId: item.saleItemId,
      }));

    if (validItems.length === 0) {
      toast({
        title: language === "ur" ? "آئٹم درکار ہے" : "Add at least one item",
        description:
          language === "ur"
            ? "ہر آئٹم کے لیے پروڈکٹ اور وزن یا بوریاں درج کریں۔"
            : "Pick a product and enter a weight or bag count.",
        variant: "destructive",
      });
      return;
    }

    if (overDispatch.length > 0) {
      toast({
        title: language === "ur" ? "زیادہ روانگی" : "Over dispatch",
        description:
          language === "ur"
            ? "روانہ مقدار دستیاب مقدار سے زیادہ ہے۔"
            : "Dispatched weight exceeds the remaining sale quantity.",
        variant: "destructive",
      });
      return;
    }

    const payload = {
      direction,
      vehicleNo: vehicleNo.trim() || null,
      driverName: driverName.trim() || null,
      driverPhone: driverPhone.trim() || null,
      partyId: partyId ? Number(partyId) : null,
      sourceType: direction === "OUT" && sourceType ? sourceType : null,
      sourceId:
        direction === "OUT"
          ? sourceType === "SALE"
            ? saleId
              ? Number(saleId)
              : null
            : processingId
              ? Number(processingId)
              : null
          : null,
      grossG: gross === "" ? null : kgToGrams(gross),
      tareG: tare === "" ? null : kgToGrams(tare),
      netG: netKg === "" ? null : kgToGrams(netKg),
      remarks: remarks.trim() || null,
      items: validItems,
    };

    createMutation.mutate(payload, {
      onSuccess: () => {
        toast({ title: t("gatePassCreated") });
        setLocation("/gate-passes");
      },
      onError: (err) => {
        toast({ title: t("saveFailed"), description: errorMessage(err), variant: "destructive" });
      },
    });
  };

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
        <Button aria-label={t("back")} variant="ghost" size="icon" onClick={() => setLocation("/gate-passes")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("newGatePass")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur"
              ? "گاڑی کی آمد یا روانگی درج کریں"
              : "Record a vehicle arrival or dispatch"}
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("direction")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex border rounded-md overflow-hidden w-fit">
            <Button
              type="button"
              variant={direction === "IN" ? "default" : "ghost"}
              onClick={() => {
                setDirection("IN");
                setSourceType("");
                setSaleId("");
                setProcessingId("");
                setItems([newItem()]);
              }}
              data-testid="direction-in"
            >
              {t("directionIn")}
            </Button>
            <Button
              type="button"
              variant={direction === "OUT" ? "default" : "ghost"}
              onClick={() => setDirection("OUT")}
              data-testid="direction-out"
            >
              {t("directionOut")}
            </Button>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("vehicleNumber")}</Label>
              <Input
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="ABC-1234"
                data-testid="input-vehicle"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("party")}</Label>
              <SearchableSelect
                options={parties.map((p) => ({
                  value: String(p.id),
                  label: p.name,
                  sublabel: p.nameUrdu || undefined,
                }))}
                value={partyId || undefined}
                onValueChange={setPartyId}
                placeholder={t("party")}
                searchPlaceholder={t("search")}
                emptyMessage={t("noResultsFound")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("driverName")}</Label>
              <Input
                value={driverName}
                onChange={(e) => setDriverName(e.target.value)}
                data-testid="input-driver"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("driverPhone")}</Label>
              <Input
                value={driverPhone}
                onChange={(e) => setDriverPhone(e.target.value)}
                data-testid="input-driver-phone"
              />
            </div>
          </div>

          {direction === "OUT" && (
            <div className="grid gap-4 md:grid-cols-2 rounded-md border p-3">
              <div className="space-y-2">
                <Label>{t("source")}</Label>
                <Select
                  value={sourceType || undefined}
                  onValueChange={(value) => {
                    setSourceType(value as SourceType);
                    setSaleId("");
                    setProcessingId("");
                    setItems([newItem()]);
                  }}
                >
                  <SelectTrigger data-testid="select-source-type">
                    <SelectValue placeholder={t("source")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SALE">{language === "ur" ? "فروخت" : "Sale"}</SelectItem>
                    <SelectItem value="JOB_RETURN">
                      {language === "ur" ? "جاب ورک واپسی" : "Job Work (Return)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {sourceType === "SALE" && (
                <div className="space-y-2">
                  <Label>{t("selectGatePass")}</Label>
                  <Select value={saleId || undefined} onValueChange={setSaleId}>
                    <SelectTrigger data-testid="select-sale">
                      <SelectValue placeholder={language === "ur" ? "فروخت منتخب کریں" : "Select sale"} />
                    </SelectTrigger>
                    <SelectContent>
                      {sales.map((sale) => (
                        <SelectItem key={sale.id} value={String(sale.id)}>
                          {sale.invoiceNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {sourceType === "JOB_RETURN" && (
                <div className="space-y-2">
                  <Label>{language === "ur" ? "بیچ" : "Batch"}</Label>
                  <Select value={processingId || undefined} onValueChange={setProcessingId}>
                    <SelectTrigger data-testid="select-batch">
                      <SelectValue placeholder={language === "ur" ? "بیچ منتخب کریں" : "Select batch"} />
                    </SelectTrigger>
                    <SelectContent>
                      {batches.map((batch) => (
                        <SelectItem key={batch.id} value={String(batch.id)}>
                          {batch.batchNumber}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {dispatchSummary.data && (
                <div className="md:col-span-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{t("dispatched")}</span>
                    <Badge
                      variant={
                        dispatchSummary.data.status === "fully_dispatched"
                          ? "default"
                          : dispatchSummary.data.status === "partly_dispatched"
                            ? "secondary"
                            : "outline"
                      }
                    >
                      {dispatchSummary.data.status === "fully_dispatched"
                        ? t("fullyDispatched")
                        : dispatchSummary.data.status === "partly_dispatched"
                          ? t("partlyDispatched")
                          : t("notDispatched")}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {t("ordered")}: {dispatchSummary.data.orderedKg.toFixed(2)} kg · {t("dispatched")}:{" "}
                    {dispatchSummary.data.dispatchedKg.toFixed(2)} kg · {t("pending")}:{" "}
                    {dispatchSummary.data.pendingKg.toFixed(2)} kg
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={`flex flex-row items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
          <CardTitle className="text-base">{t("items")}</CardTitle>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setItems((prev) => [...prev, newItem()])}
            data-testid="button-add-item"
          >
            <Plus className="h-4 w-4" />
            {t("addItem")}
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {items.map((item, index) => (
            <div key={item.key} className="grid grid-cols-12 gap-2 items-end">
              <div className="col-span-5 space-y-1">
                {index === 0 && <Label className="text-xs">{t("product")}</Label>}
                <Select
                  value={item.productId || undefined}
                  onValueChange={(value) => updateItem(item.key, { productId: value })}
                >
                  <SelectTrigger data-testid={`select-product-${index}`}>
                    <SelectValue placeholder={t("selectProduct")} />
                  </SelectTrigger>
                  <SelectContent>
                    {products.map((product) => (
                      <SelectItem key={product.id} value={String(product.id)}>
                        {product.name}
                        {product.nameUrdu ? ` (${product.nameUrdu})` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-3 space-y-1">
                {index === 0 && <Label className="text-xs">{t("bags")}</Label>}
                <Input
                  type="number"
                  min="0"
                  value={item.bags}
                  onChange={(e) => updateItem(item.key, { bags: e.target.value })}
                  data-testid={`input-bags-${index}`}
                />
              </div>
              <div className="col-span-3 space-y-1">
                {index === 0 && <Label className="text-xs">{t("weightKg")}</Label>}
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.weightKg}
                  onChange={(e) => updateItem(item.key, { weightKg: e.target.value })}
                  data-testid={`input-weight-${index}`}
                />
              </div>
              <div className="col-span-1 flex justify-end">
                {items.length > 1 && (
                  <Button aria-label={t("delete")}
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => setItems((prev) => prev.filter((it) => it.key !== item.key))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}

          {overDispatch.length > 0 && (
            <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertTriangle className="h-4 w-4 mt-0.5" />
              <span>
                {language === "ur"
                  ? "روانہ مقدار باقی مقدار سے زیادہ ہے۔"
                  : "Entered weight exceeds the remaining quantity for one or more products."}
              </span>
            </div>
          )}

          <div className={`flex gap-6 text-sm font-medium ${isRTL ? "flex-row-reverse" : ""}`}>
            <span>
              {t("total")} {t("bags")}: <span className="font-mono">{totalBags}</span>
            </span>
            <span>
              {t("total")} {t("weightKg")}:{" "}
              <span className="font-mono">{totalWeightKg.toFixed(2)}</span>
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("weighbridge")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>{t("grossWeight")}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={gross}
              onChange={(e) => setGross(e.target.value)}
              data-testid="input-gross"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("tareWeight")}</Label>
            <Input
              type="number"
              min="0"
              step="0.01"
              value={tare}
              onChange={(e) => setTare(e.target.value)}
              data-testid="input-tare"
            />
          </div>
          <div className="space-y-2">
            <Label>{t("netWeight")}</Label>
            <Input value={netKg} readOnly data-testid="input-net" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className="space-y-2">
            <Label>{t("remarks")}</Label>
            <Textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              data-testid="input-remarks"
            />
          </div>
          <div className={`flex gap-2 ${isRTL ? "flex-row-reverse justify-start" : "justify-end"}`}>
            <Button variant="outline" onClick={() => setLocation("/gate-passes")}>
              {t("cancel")}
            </Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending}
              data-testid="button-save"
            >
              {createMutation.isPending ? t("loading") : t("save")}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
