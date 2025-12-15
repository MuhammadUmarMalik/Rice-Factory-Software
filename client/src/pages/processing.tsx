import { useEffect, useMemo, useState } from "react";
import { Plus, Play, CheckCircle, Package, ArrowRight, Scale, Factory, Pencil, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { DataTable, type Column } from "@/components/data-table";
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
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Processing, ProcessingOutput, Product } from "@shared/schema";
import { format } from "date-fns";

const processingFormSchema = z.object({
  sourceProductId: z.string().min(1, "Source product is required"),
  sourceQuantity: z.string().min(1, "Quantity is required"),
  outputProductId: z.string().optional(),
  notes: z.string().optional(),
});

const outputLineSchema = z.object({
  productId: z.string().min(1, "Output product is required"),
  quantity: z.string().min(1, "Quantity is required"),
  outputType: z.enum(["processed", "raw"]).default("processed"),
});

const completeFormSchema = z.object({
  outputs: z.array(outputLineSchema).min(1, "At least one output is required"),
  wastageQuantity: z.string().default("0"),
});

const editOutputSchema = outputLineSchema.pick({ productId: true, quantity: true });

type ProcessingFormData = z.infer<typeof processingFormSchema>;
type CompleteFormData = z.infer<typeof completeFormSchema>;
type OutputLineForm = z.infer<typeof outputLineSchema>;
type EditOutputForm = z.infer<typeof editOutputSchema>;

type ProcessingWithProducts = Processing & {
  sourceProduct?: Product;
  outputProduct?: Product;
  outputs?: (ProcessingOutput & { product?: Product })[];
};

export default function ProcessingPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [selectedProcessing, setSelectedProcessing] = useState<ProcessingWithProducts | null>(null);
  const [detailProcessing, setDetailProcessing] = useState<ProcessingWithProducts | null>(null);
  const [editingOutput, setEditingOutput] = useState<(ProcessingOutput & { product?: Product }) | null>(null);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");

  const form = useForm<ProcessingFormData>({
    resolver: zodResolver(processingFormSchema),
    defaultValues: {
      sourceProductId: "",
      sourceQuantity: "",
      outputProductId: "",
      notes: "",
    },
  });

  const completeForm = useForm<CompleteFormData>({
    resolver: zodResolver(completeFormSchema),
    defaultValues: {
      outputs: [{ productId: "", quantity: "", outputType: "processed" }],
      wastageQuantity: "0",
    },
  });

  const addOutputForm = useForm<OutputLineForm>({
    resolver: zodResolver(outputLineSchema),
    defaultValues: { productId: "", quantity: "", outputType: "processed" },
  });

  const editOutputForm = useForm<EditOutputForm>({
    resolver: zodResolver(editOutputSchema),
    defaultValues: { productId: "", quantity: "" },
  });

  const completeOutputs = useFieldArray({
    control: completeForm.control,
    name: "outputs",
  });

  const { data: processingList = [], isLoading } = useQuery<ProcessingWithProducts[]>({
    queryKey: ["/api/processing"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const paddyProduct = useMemo(
    () => products.find((p) => p.productType === "raw" && p.name.toLowerCase() === "paddy"),
    [products]
  );
  const processedProducts = useMemo(
    () => products.filter((p) => p.productType === "processed"),
    [products]
  );

  const formatError = (err: any) => {
    if (!err) return "Something went wrong";
    if (typeof err === "string") return err;
    if (err?.message) return err.message;
    return "Something went wrong";
  };

  useEffect(() => {
    if (paddyProduct && !form.getValues("sourceProductId")) {
      form.setValue("sourceProductId", paddyProduct.id.toString());
    }
  }, [form, paddyProduct]);

  useEffect(() => {
    if (processedProducts.length && !completeForm.getValues("outputs")?.[0]?.productId) {
      completeForm.setValue("outputs.0.productId", processedProducts[0].id.toString());
    }
    if (processedProducts.length && !addOutputForm.getValues("productId")) {
      addOutputForm.setValue("productId", processedProducts[0].id.toString());
    }
  }, [processedProducts, completeForm, addOutputForm]);

  useEffect(() => {
    if (detailProcessing && processedProducts.length) {
      addOutputForm.reset({ productId: processedProducts[0].id.toString(), quantity: "", outputType: "processed" });
    }
  }, [detailProcessing, processedProducts, addOutputForm]);

  const createMutation = useMutation({
    mutationFn: (data: ProcessingFormData) =>
      apiRequest("POST", "/api/processing", {
        ...data,
        sourceProductId: parseInt(data.sourceProductId),
        outputProductId: data.outputProductId ? parseInt(data.outputProductId) : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset({
        sourceProductId: paddyProduct ? paddyProduct.id.toString() : "",
        sourceQuantity: "",
        outputProductId: "",
        notes: "",
      });
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err: any) => {
      toast({ title: "Save failed", description: formatError(err), variant: "destructive" });
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/processing/${id}/start`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      toast({ title: language === "ur" ? "???????? ???? ?? ???" : "Processing started" });
    },
    onError: (err: any) => {
      toast({ title: "Start failed", description: formatError(err), variant: "destructive" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (data: CompleteFormData & { id: number }) =>
      apiRequest("PATCH", `/api/processing/${data.id}/complete`, {
        outputs: data.outputs.map((o) => ({
          productId: parseInt(o.productId),
          quantity: o.quantity,
          outputType: "processed",
        })),
        wastageQuantity: data.wastageQuantity || "0",
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsCompleteDialogOpen(false);
      setSelectedProcessing(null);
      completeForm.reset({
        outputs: [{ productId: processedProducts[0]?.id?.toString() || "", quantity: "", outputType: "processed" }],
        wastageQuantity: "0",
      });
      toast({ title: language == "ur" ? "???????? ???? ?? ???" : "Processing completed" });
    },
    onError: (err: any) => {
      toast({ title: "Complete failed", description: formatError(err), variant: "destructive" });
    },
  });

  const addOutputMutation = useMutation({
    mutationFn: (payload: { processingId: number; data: OutputLineForm }) =>
      apiRequest("POST", `/api/processing/${payload.processingId}/outputs`, {
        productId: parseInt(payload.data.productId),
        quantity: payload.data.quantity,
        outputType: "processed",
      }),
    onSuccess: (created: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      const withProduct = { ...created, product: products.find((p) => p.id === created.productId) };
      setDetailProcessing((prev) => {
        if (!prev || prev.id !== variables.processingId) return prev;
        const outputs = prev.outputs || [];
        return { ...prev, outputs: [...outputs, withProduct] };
      });
      addOutputForm.reset({ productId: processedProducts[0]?.id?.toString() || "", quantity: "", outputType: "processed" });
      toast({ title: "Output added" });
    },
    onError: (err: any) => {
      toast({ title: "Add failed", description: formatError(err), variant: "destructive" });
    },
  });

  const updateOutputMutation = useMutation({
    mutationFn: (payload: { processingId: number; outputId: number; data: EditOutputForm }) =>
      apiRequest("PATCH", `/api/processing/${payload.processingId}/outputs/${payload.outputId}`, {
        productId: parseInt(payload.data.productId),
        quantity: payload.data.quantity,
      }),
    onSuccess: (updated: any, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      const withProduct = { ...updated, product: products.find((p) => p.id === updated.productId) };
      setDetailProcessing((prev) => {
        if (!prev || prev.id !== variables.processingId) return prev;
        const outputs = prev.outputs || [];
        const next = outputs.map((o) => (o.id === variables.outputId ? withProduct : o));
        return { ...prev, outputs: next };
      });
      editOutputForm.reset({ productId: "", quantity: "" });
      setEditingOutput(null);
      toast({ title: "Output updated" });
    },
    onError: (err: any) => {
      toast({ title: "Update failed", description: formatError(err), variant: "destructive" });
    },
  });

  const deleteOutputMutation = useMutation({
    mutationFn: (payload: { processingId: number; outputId: number }) =>
      apiRequest("DELETE", `/api/processing/${payload.processingId}/outputs/${payload.outputId}`),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setDetailProcessing((prev) => {
        if (!prev || prev.id !== variables.processingId) return prev;
        const outputs = prev.outputs || [];
        return { ...prev, outputs: outputs.filter((o) => o.id !== variables.outputId) };
      });
      toast({ title: "Output deleted" });
    },
    onError: (err: any) => {
      toast({ title: "Delete failed", description: formatError(err), variant: "destructive" });
    },
  });

  const handleAddNew = () => {
    form.reset({
      sourceProductId: paddyProduct ? paddyProduct.id.toString() : "",
      sourceQuantity: "",
      outputProductId: "",
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleStart = (processing: ProcessingWithProducts) => {
    startMutation.mutate(processing.id);
  };

  const handleComplete = (processing: ProcessingWithProducts) => {
    setSelectedProcessing(processing);
    const existingOutputs = (processing.outputs || []).map((out) => ({
      productId: out.productId.toString(),
      quantity: out.quantity || "",
      outputType: "processed" as const,
    }));
    completeForm.reset({
      outputs: existingOutputs.length
        ? existingOutputs
        : [{ productId: processedProducts[0]?.id?.toString() || "", quantity: "", outputType: "processed" }],
      wastageQuantity: processing.wastageQuantity || "0",
    });
    setIsCompleteDialogOpen(true);
  };

  const pendingItems = processingList.filter(p => p.status === "pending");
  const inProgressItems = processingList.filter(p => p.status === "in_progress");
  const completedItems = processingList.filter(p => p.status === "completed");

  const formatDateSafe = (value?: any) => (value ? format(new Date(value), "dd MMM yyyy") : "â€”");

  const sumOutputs = (outputs?: (ProcessingOutput & { product?: Product })[]) =>
    outputs?.reduce((sum, out) => sum + parseFloat(out.quantity || "0"), 0) || 0;

  const handleEditOutput = (output: ProcessingOutput & { product?: Product }) => {
    setEditingOutput(output);
    editOutputForm.reset({
      productId: output.productId.toString(),
      quantity: output.quantity || "",
    });
  };

  const handleDeleteOutput = (output: ProcessingOutput & { product?: Product }) => {
    if (!detailProcessing) return;
    if (!window.confirm("Delete this output? Stock will be reversed if available.")) return;
    deleteOutputMutation.mutate({ processingId: detailProcessing.id, outputId: output.id });
  };

  const handleAddOutputSubmit = addOutputForm.handleSubmit((data) => {
    if (!detailProcessing) return;
    addOutputMutation.mutate({ processingId: detailProcessing.id, data });
  });



  const columns: Column<ProcessingWithProducts>[] = [
    {
      key: "batchNumber",
      title: "Batch",
      render: (item) => <span className="font-mono text-sm">{item.batchNumber}</span>,
    },
    {
      key: "sourceProduct",
      title: "Source",
      render: (item) => (
        <div className="flex flex-col">
          <span className="font-medium">{item.sourceProduct?.name || "-"}</span>
          {item.sourceProduct?.nameUrdu && <span className="text-xs text-muted-foreground font-urdu">{item.sourceProduct.nameUrdu}</span>}
        </div>
      ),
    },
    {
      key: "sourceQuantity",
      title: "Input (kg)",
      align: "right",
      render: (item) => <span className="font-mono">{parseFloat(item.sourceQuantity).toLocaleString()}</span>,
    },
    {
      key: "outputs",
      title: "Outputs",
      render: (item) => (
        <div className="flex flex-col gap-1">
          {(item.outputs || []).length === 0 && <span className="text-muted-foreground">—</span>}
          {(item.outputs || []).map((out) => (
            <div key={out.id} className="flex items-center justify-between text-xs">
              <span className="font-medium">{out.product?.name || "-"}</span>
              <span className="font-mono text-muted-foreground">{parseFloat(out.quantity || "0").toLocaleString()} kg</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      key: "outputQuantity",
      title: "Total Output (kg)",
      align: "right",
      render: (item) => {
        const total = sumOutputs(item.outputs);
        return total > 0 ? <span className="font-mono">{total.toLocaleString()}</span> : "—";
      },
    },
    {
      key: "wastageQuantity",
      title: "Wastage",
      align: "right",
      render: (item) => item.wastageQuantity ? <span className="font-mono text-muted-foreground">{parseFloat(item.wastageQuantity).toLocaleString()}</span> : "—",
    },
    {
      key: "status",
      title: "Status",
      align: "center",
      render: (item) => (
        <Badge variant={
          item.status === "completed" ? "default" :
          item.status === "in_progress" ? "secondary" : "outline"
        }>
          {item.status === "completed" ? t("completed") :
           item.status === "in_progress" ? t("inProgress") : t("pending")}
        </Badge>
      ),
    },
    {
      key: "dates",
      title: "Dates",
      render: (item) => (
        <div className="text-xs text-muted-foreground">
          <div>Start: {formatDateSafe(item.startDate)}</div>
          <div>Done: {item.completedDate ? formatDateSafe(item.completedDate) : "—"}</div>
        </div>
      ),
    },
    {
      key: "actions",
      title: "Actions",
      align: "center",
      render: (item) => (
        <div className="flex gap-2 justify-center">
          {item.status === "pending" && (
            <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); handleStart(item); }}>
              <Play className="h-3 w-3" />
              {language === "ur" ? "شروع کریں" : "Start"}
              </Button>
          )}
          {item.status === "in_progress" && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleComplete(item); }}>
              <CheckCircle className="h-3 w-3" />
              {language === "ur" ? "مکمل کریں" : "Complete"}
            </Button>
          )}
        </div>
      ),
    },
  ];


  const ProcessingCard = ({ item }: { item: ProcessingWithProducts }) => (
    <Card
      className="hover-elevate cursor-pointer"
      data-testid={`processing-card-${item.id}`}
      onClick={() => setDetailProcessing(item)}
    >
      <CardContent className="p-4">
        <div className={`flex items-start justify-between gap-2 mb-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className={isRTL ? "text-right" : ""}>
            <p className="font-mono text-sm text-muted-foreground">{item.batchNumber}</p>
            <p className="font-medium">{item.sourceProduct?.name}</p>
            {item.sourceProduct?.nameUrdu && (
              <p className="text-sm text-muted-foreground font-urdu">{item.sourceProduct.nameUrdu}</p>
            )}
          </div>
          <Badge variant={
            item.status === "completed" ? "default" :
            item.status === "in_progress" ? "secondary" : "outline"
          }>
            {item.status === "completed" ? t("completed") :
             item.status === "in_progress" ? t("inProgress") : t("pending")}
          </Badge>
        </div>
        
        <div className={`flex items-center gap-2 text-sm mb-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Scale className="h-3 w-3 text-muted-foreground" />
          <span className="font-mono">{parseFloat(item.sourceQuantity).toLocaleString()} kg</span>
          {item.outputs && item.outputs.length > 0 && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-primary">{sumOutputs(item.outputs).toLocaleString()} kg</span>
            </>
          )}
        </div>
        {item.outputs && item.outputs.length > 0 && (
          <div className={`space-y-1 text-xs mb-3 ${isRTL ? "text-right" : ""}`}>
            {item.outputs.slice(0, 3).map((out) => (
              <div key={out.id} className="flex items-center justify-between">
                <span className="font-medium">{out.product?.name || "-"}</span>
                <span className="font-mono text-muted-foreground">{parseFloat(out.quantity || "0").toLocaleString()} kg</span>
              </div>
            ))}
            {item.outputs.length > 3 && (
              <span className="text-muted-foreground">+{item.outputs.length - 3} more outputs</span>
            )}
          </div>
        )}

        {item.notes && (
          <p className="text-sm text-muted-foreground mb-3 truncate">{item.notes}</p>
        )}

        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          {item.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={(e) => { e.stopPropagation(); handleStart(item); }}
              disabled={startMutation.isPending}
              data-testid={`button-start-${item.id}`}
            >
              <Play className="h-3 w-3" />
              {language === "ur" ? "شروع کریں" : "Start"}
            </Button>
          )}
          {item.status === "in_progress" && (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleComplete(item); }}
              data-testid={`button-complete-${item.id}`}
            >
              <CheckCircle className="h-3 w-3" />
              {language === "ur" ? "مکمل کریں" : "Complete"}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("processing")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "???? ???????? ?? ??????" : "Manage stock processing workflow"}
          </p>
        </div>
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="flex border rounded-md overflow-hidden">
            <Button
              variant={viewMode === "cards" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("cards")}
            >
              Cards
            </Button>
            <Button
              variant={viewMode === "table" ? "default" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
            >
              Table
            </Button>
          </div>
          <Button onClick={handleAddNew} data-testid="button-add-processing">
            <Plus className="h-4 w-4" />
            {t("processStock")}
          </Button>
        </div>
      </div>

      {viewMode === "cards" ? (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card>
            <CardHeader className={`pb-3 ${isRTL ? "text-right" : ""}`}>
              <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-muted">
                  <Package className="h-4 w-4 text-muted-foreground" />
                </div>
                {t("pending")}
                <Badge variant="secondary" className="ml-auto">{pendingItems.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))
              ) : pendingItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {language === "ur" ? "???? ??? ?????? ???? ????" : "No pending items"}
                </p>
              ) : (
                pendingItems.map((item) => <ProcessingCard key={item.id} item={item} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className={`pb-3 ${isRTL ? "text-right" : ""}`}>
              <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-chart-3/10">
                  <Factory className="h-4 w-4 text-chart-3" />
                </div>
                {t("inProgress")}
                <Badge variant="default" className="ml-auto">{inProgressItems.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))
              ) : inProgressItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {language === "ur" ? "???? ???? ???????? ????" : "No items in progress"}
                </p>
              ) : (
                inProgressItems.map((item) => <ProcessingCard key={item.id} item={item} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className={`pb-3 ${isRTL ? "text-right" : ""}`}>
              <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
                  <CheckCircle className="h-4 w-4 text-primary" />
                </div>
                {t("completed")}
                <Badge variant="outline" className="ml-auto">{completedItems.length}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {isLoading ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={i} className="h-32 w-full" />
                ))
              ) : completedItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  {language === "ur" ? "???? ???? ???? ????" : "No completed items"}
                </p>
              ) : (
                completedItems.slice(0, 5).map((item) => <ProcessingCard key={item.id} item={item} />)
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card>
          <CardContent className="pt-6">
            <DataTable
              columns={columns}
              data={processingList}
              isLoading={isLoading}
              onRowClick={(row) => setDetailProcessing(row)}
              testIdPrefix="processing"
            />
          </CardContent>
        </Card>
      )}

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby="processing-new-desc">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {language === "ur" ? "??? ????????" : "New Processing"}
            </DialogTitle>
            <p id="processing-new-desc" className="sr-only">Create a processing batch from Paddy input.</p>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit((data) => createMutation.mutate(data))} className="space-y-4">
              <FormField
                control={form.control}
                name="sourceProductId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("sourceProduct")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value || undefined}>
                      <FormControl>
                        <SelectTrigger data-testid="select-source-product">
                          <SelectValue placeholder={language === "ur" ? "????? ????" : "Select product"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {paddyProduct ? (
                          <SelectItem value={paddyProduct.id.toString()}>
                            {paddyProduct.name} ({parseFloat(paddyProduct.currentStock).toLocaleString()} {paddyProduct.unit})
                          </SelectItem>
                        ) : (
                          products
                            .filter((p) => p.productType === "raw")
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.name} ({parseFloat(p.currentStock).toLocaleString()} {p.unit})
                              </SelectItem>
                            ))
                        )}
                        {!paddyProduct && products.filter((p) => p.productType === "raw").length === 0 && (
                          <SelectItem value="">{language === "ur" ? "No raw product" : "Add Paddy in products"}</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sourceQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("inputQuantity")} (kg)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" data-testid="input-quantity" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="outputProductId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("outputProduct")} ({language === "ur" ? "???????" : "Optional"})</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-output-product">
                          <SelectValue placeholder={language === "ur" ? "????? ????" : "Select product"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {processedProducts.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name}
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
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{language === "ur" ? "????" : "Notes"}</FormLabel>
                    <FormControl>
                      <Textarea {...field} rows={2} data-testid="input-notes" />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className={`flex gap-2 pt-4 ${isRTL ? "flex-row-reverse" : "justify-end"}`}>
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={createMutation.isPending}>
                  {createMutation.isPending ? t("loading") : t("save")}
                </Button>
              </div>
                            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={isCompleteDialogOpen} onOpenChange={setIsCompleteDialogOpen}>
        <DialogContent className="sm:max-w-md" aria-describedby="processing-complete-desc">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {language === "ur" ? "???????? ???? ????" : "Complete Processing"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {language === "ur"
              ? "Paddy input stays fixed; choose processed outputs to close the batch."
              : "Paddy remains the input. Select processed outputs below to complete the batch."}
          </p>
          <span id="processing-complete-desc" className="sr-only">
            Enter processed outputs and quantities to finish the batch.
          </span>

          <Form {...completeForm}>
            <form
              onSubmit={completeForm.handleSubmit((data) =>
                completeMutation.mutate({ ...data, id: selectedProcessing!.id })
              )}
              className="space-y-4"
            >
              <div className="space-y-3">
            {completeOutputs.fields.map((field, index) => (
              <div key={field.id} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-7">
                  <FormField
                    control={completeForm.control}
                    name={`outputs.${index}.productId` as const}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("outputProduct")}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger data-testid={`select-output-${index}`}>
                              <SelectValue placeholder={language === "ur" ? "Select processed" : "Select processed"} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {processedProducts.map((p) => (
                              <SelectItem key={p.id} value={p.id.toString()}>
                                {p.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-4">
                  <FormField
                    control={completeForm.control}
                    name={`outputs.${index}.quantity` as const}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("outputQuantity")} (kg)</FormLabel>
                        <FormControl>
                          <Input {...field} type="number" step="0.01" data-testid={`input-output-${index}`} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="col-span-1 flex justify-end">
                  {completeOutputs.fields.length > 1 && (
                    <Button type="button" variant="ghost" size="icon" onClick={() => completeOutputs.remove(index)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => completeOutputs.append({ productId: processedProducts[0]?.id?.toString() || "", quantity: "", outputType: "processed" })}
              className="flex items-center gap-2"
            >
              <Plus className="h-4 w-4" />
              {language === "ur" ? "Add another output" : "Add another output"}
            </Button>
          </div>
          <FormField
            control={completeForm.control}
            name="wastageQuantity"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t("wastage")} (kg)</FormLabel>
                <FormControl>
                  <Input {...field} type="number" step="0.01" data-testid="input-wastage" />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div className={`flex gap-2 pt-4 ${isRTL ? "flex-row-reverse" : "justify-end"}`}>
            <Button type="button" variant="outline" onClick={() => setIsCompleteDialogOpen(false)}>
              {t("cancel")}
            </Button>
            <Button type="submit" disabled={completeMutation.isPending}>
              <CheckCircle className="h-4 w-4" />
              {completeMutation.isPending ? t("loading") : (language === "ur" ? "Complete" : "Complete")}
            </Button>
          </div>
        </form>
          </Form>

        </DialogContent>
      </Dialog>

      <Dialog open={!!detailProcessing} onOpenChange={(open) => !open && setDetailProcessing(null)}>
        <DialogContent className="sm:max-w-lg" aria-describedby="processing-detail-desc">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right" : ""}>
              {detailProcessing?.batchNumber || "Processing Details"}
            </DialogTitle>
          </DialogHeader>
          <p id="processing-detail-desc" className="sr-only">Review processing batch quantities and outputs.</p>
          {detailProcessing && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <Badge variant={
                  detailProcessing.status === "completed" ? "default" :
                  detailProcessing.status === "in_progress" ? "secondary" : "outline"
                }>
                  {detailProcessing.status === "completed" ? t("completed") :
                   detailProcessing.status === "in_progress" ? t("inProgress") : t("pending")}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-medium">{detailProcessing.sourceProduct?.name || "-"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Input Qty (kg)</p>
                  <p className="font-mono">{parseFloat(detailProcessing.sourceQuantity).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Total Output (kg)</p>
                  <p className="font-mono">{sumOutputs(detailProcessing.outputs).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Wastage (kg)</p>
                  <p className="font-mono">{detailProcessing.wastageQuantity ? parseFloat(detailProcessing.wastageQuantity).toLocaleString() : "—"}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Start</p>
                  <p>{formatDateSafe(detailProcessing.startDate)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Completed</p>
                  <p>{detailProcessing.completedDate ? formatDateSafe(detailProcessing.completedDate) : "—"}</p>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">Outputs</p>
                  {detailProcessing.status !== "pending" && (
                    <span className="text-xs text-muted-foreground">Editable while stock is available</span>
                  )}
                </div>
                {(detailProcessing.outputs || []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">No outputs recorded</p>
                ) : (
                  <div className="border rounded-md divide-y">
                    <div className="grid grid-cols-12 px-3 py-2 text-xs text-muted-foreground">
                      <div className="col-span-7">Product</div>
                      <div className="col-span-3 text-right">Quantity (kg)</div>
                      <div className="col-span-2 text-right">Actions</div>
                    </div>
                    {(detailProcessing.outputs || []).map((out) => (
                      <div key={out.id} className="grid grid-cols-12 items-center px-3 py-2 text-sm">
                        <div className="col-span-7 flex flex-col">
                          <span className="font-medium">{out.product?.name || "-"}</span>
                          <span className="text-xs text-muted-foreground">{out.outputType || "processed"}</span>
                        </div>
                        <div className="col-span-3 text-right font-mono">{parseFloat(out.quantity || "0").toLocaleString()}</div>
                        <div className="col-span-2 flex justify-end gap-2">
                          <Button size="icon" variant="ghost" disabled={detailProcessing.status === "pending" || deleteOutputMutation.isPending} onClick={() => handleEditOutput(out)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" disabled={detailProcessing.status === "pending" || deleteOutputMutation.isPending} onClick={() => handleDeleteOutput(out)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {detailProcessing.status !== "pending" && (
                  <Form {...addOutputForm}>
                    <form className="grid grid-cols-12 gap-2 items-end" onSubmit={handleAddOutputSubmit}>
                      <div className="col-span-7">
                        <FormField
                          control={addOutputForm.control}
                          name="productId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Add output product</FormLabel>
                              <Select onValueChange={field.onChange} value={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select processed" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {processedProducts.map((p) => (
                                    <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
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
                          control={addOutputForm.control}
                          name="quantity"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Quantity (kg)</FormLabel>
                              <FormControl>
                                <Input {...field} type="number" step="0.01" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="col-span-2 flex justify-end">
                        <Button type="submit" size="sm" disabled={addOutputMutation.isPending}>
                          {addOutputMutation.isPending ? t("loading") : "Add"}
                        </Button>
                      </div>
                    </form>
                  </Form>
                )}
              </div>

              {detailProcessing.notes && (
                <div className="text-sm">
                  <p className="text-muted-foreground">Notes</p>
                  <p>{detailProcessing.notes}</p>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingOutput} onOpenChange={(open) => { if (!open) setEditingOutput(null); }}>
        <DialogContent className="sm:max-w-sm" aria-describedby="processing-edit-output-desc">
          <DialogHeader>
            <DialogTitle>{language === "ur" ? "Edit output" : "Edit output"}</DialogTitle>
          </DialogHeader>
          <p id="processing-edit-output-desc" className="sr-only">Edit processed output product and quantity.</p>
          {editingOutput && (
            <Form {...editOutputForm}>
              <form
                onSubmit={editOutputForm.handleSubmit((data) => {
                  const processingId = detailProcessing?.id || editingOutput.processingId;
                  if (!processingId) return;
                  updateOutputMutation.mutate({ processingId, outputId: editingOutput.id, data });
                })}
                className="space-y-3"
              >
                <FormField
                  control={editOutputForm.control}
                  name="productId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("outputProduct")}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select processed" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {processedProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id.toString()}>{p.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={editOutputForm.control}
                  name="quantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("outputQuantity")}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditingOutput(null)}>
                    {t("cancel")}
                  </Button>
                  <Button type="submit" disabled={updateOutputMutation.isPending}>
                    {updateOutputMutation.isPending ? t("loading") : t("save")}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}
