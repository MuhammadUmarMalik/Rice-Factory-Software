import { useEffect, useState } from "react";
import { Plus, Play, CheckCircle, Package, ArrowRight, Scale, Factory, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { SkeletonBox } from "@/components/ui/skeletons";
import { DataTable, type Column } from "@/components/data-table";
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
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Processing, ProcessingOutput, Product } from "@/types/schema";
import { format } from "date-fns";

const processingFormSchema = z.object({
  sourceProductId: z.string().min(1, "Source product is required"),
  sourceQuantity: z
    .string()
    .min(1, "Quantity is required")
    .refine((val) => parseFloat(val) >= 5, { message: "Minimum 5 kg required" }),
  outputProductId: z.string().optional(),
  notes: z.string().optional(),
});

const outputLineSchema = z.object({
  productId: z.string().min(1, "Output product is required"),
  quantity: z
    .string()
    .min(1, "Quantity is required")
    .refine((val) => parseFloat(val) > 0, { message: "Quantity must be greater than 0" }),
});

const completeFormSchema = z.object({
  outputs: z.array(outputLineSchema).min(1, "At least one output is required"),
  wastageQuantity: z.string().default("0"),
  outputCategory: z.enum(["rice_head", "broken_rice", "rice_polish", "kacher_nakoo"]),
});

type ProcessingFormData = z.infer<typeof processingFormSchema>;
type CompleteFormData = z.infer<typeof completeFormSchema>;

const outputCategoryOptions: { value: CompleteFormData["outputCategory"]; label: string }[] = [
  { value: "rice_head", label: "Rice Head" },
  { value: "broken_rice", label: "Broken Rice" },
  { value: "rice_polish", label: "Rice Polish" },
  { value: "kacher_nakoo", label: "Kacher (Nakoo)" },
];
type ProcessingOutputWithProduct = ProcessingOutput & { product?: Product };
type ProcessingWithProducts = Processing & {
  sourceProduct?: Product;
  outputProduct?: Product;
  outputs?: ProcessingOutputWithProduct[];
};

/** Total yield of a batch, from its outputs or its legacy single-output pair. */
const totalOutputQuantity = (item: ProcessingWithProducts): number => {
  if (item.outputs?.length) {
    return item.outputs.reduce((sum, output) => sum + (parseFloat(output.quantity) || 0), 0);
  }
  return parseFloat(item.outputQuantity || "0") || 0;
};

export default function ProcessingPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [selectedProcessing, setSelectedProcessing] = useState<Processing | null>(null);
  const [detailProcessing, setDetailProcessing] = useState<ProcessingWithProducts | null>(null);
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
      outputs: [{ productId: "", quantity: "" }],
      wastageQuantity: "0",
      outputCategory: "rice_head",
    },
  });

  const outputFields = useFieldArray({ control: completeForm.control, name: "outputs" });

  const { data: processingList = [], isLoading } = useQuery<ProcessingWithProducts[]>({
    queryKey: ["/api/processing"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const bioProductNames = [
    "Head Rice",
    "Broken Rice",
    "Rice Polish",
    "Kacher(Nakoo)",
    "Head White Rice",
    "Head Brown Rice",
    "White Broken Rice",
    "Brown Broken Rice",
    "Waste",
    "Husk",
  ].map((n) => n.toLowerCase());
  const allowedBioName = (name?: string) => bioProductNames.includes((name || "").trim().toLowerCase());
  const isBioType = (value?: string | null) => (value || "").toLowerCase() === "bio";
  const bioProducts = products.filter((p) => isBioType(p.productType) || allowedBioName(p.name));

  // Ensure an output product is preselected when available
  useEffect(() => {
    if (!form.getValues("outputProductId") && bioProducts[0]) {
      form.setValue("outputProductId", bioProducts[0].id.toString(), { shouldDirty: false });
    }
    if (!completeForm.getValues("outputs.0.productId") && bioProducts[0]) {
      completeForm.setValue("outputs.0.productId", bioProducts[0].id.toString(), { shouldDirty: false });
    }
  }, [bioProducts, form, completeForm]);

  const formatError = (err: any) => {
    if (!err) return "Something went wrong";
    if (typeof err === "string") return err;
    if (err?.message) return err.message;
    return "Something went wrong";
  };

  const createMutation = useMutation({
    mutationFn: (data: ProcessingFormData) =>
      apiRequest("POST", "/api/processing", {
        ...data,
        sourceProductId: parseInt(data.sourceProductId),
        outputProductId: data.outputProductId
          ? parseInt(data.outputProductId)
          : null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset({
        sourceProductId: "",
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
        outputs: data.outputs.map((output) => ({
          productId: parseInt(output.productId),
          quantity: output.quantity,
          outputType: "bio",
        })),
        wastageQuantity: data.wastageQuantity,
        outputCategory: data.outputCategory,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsCompleteDialogOpen(false);
      setSelectedProcessing(null);
      completeForm.reset();
      toast({ title: language == "ur" ? "???????? ???? ?? ???" : "Processing completed" });
    },
    onError: (err: any) => {
      toast({ title: "Complete failed", description: formatError(err), variant: "destructive" });
    },
  });

  const handleAddNew = () => {
    const defaultOutput = bioProducts[0]?.id?.toString() ?? "";
    form.reset({
      sourceProductId: "",
      sourceQuantity: "",
      outputProductId: defaultOutput,
      notes: "",
    });
    setIsDialogOpen(true);
  };

  const handleStart = (processing: Processing) => {
    startMutation.mutate(processing.id);
  };

  const handleComplete = (processing: Processing) => {
    setSelectedProcessing(processing);
    const defaultOutput = bioProducts[0]?.id?.toString() ?? "";
    const allowedCategories = ["rice_head", "broken_rice", "rice_polish", "kacher_nakoo"] as const;
    const category = allowedCategories.includes(processing.outputCategory as any)
      ? (processing.outputCategory as (typeof allowedCategories)[number])
      : "rice_head";
    completeForm.reset({
      outputs: [
        {
          productId: processing.outputProductId ? processing.outputProductId.toString() : defaultOutput,
          quantity: "",
        },
      ],
      wastageQuantity: "0",
      outputCategory: category,
    });
    setIsCompleteDialogOpen(true);
  };

  const pendingItems = processingList.filter(p => p.status === "pending");
  const inProgressItems = processingList.filter(p => p.status === "in_progress");
  const completedItems = processingList.filter(p => p.status === "completed");

  const formatDateSafe = (value?: any) => (value ? format(new Date(value), "dd MMM yyyy") : "—");

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
      key: "outputProduct",
      title: "Output",
      render: (item) => (
        <div className="flex flex-col">
          <span>{item.outputProduct?.name || "—"}</span>
          {item.outputCategory && (
            <span className="text-xs text-muted-foreground">
              {outputCategoryOptions.find(opt => opt.value === item.outputCategory)?.label || item.outputCategory}
            </span>
          )}
        </div>
      ),
    },
    {
      key: "outputQuantity",
      title: "Output (kg)",
      align: "right",
      render: (item) => {
        const total = totalOutputQuantity(item);
        return total ? <span className="font-mono">{total.toLocaleString()}</span> : "—";
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
              {language === "ur" ? "???? ????" : "Start"}
            </Button>
          )}
          {item.status === "in_progress" && (
            <Button size="sm" onClick={(e) => { e.stopPropagation(); handleComplete(item); }}>
              <CheckCircle className="h-3 w-3" />
              {language === "ur" ? "???? ????" : "Complete"}
            </Button>
          )}
        </div>
      ),
    },
  ];

  const ProcessingCard = ({ item }: { item: Processing & { sourceProduct?: Product; outputProduct?: Product } }) => (
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
          {totalOutputQuantity(item) > 0 && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-primary">{totalOutputQuantity(item).toLocaleString()} kg</span>
            </>
          )}
        </div>
        {item.outputCategory && (
          <p className={`text-xs mb-3 ${isRTL ? "text-right" : ""}`}>
            <span className="font-semibold text-muted-foreground">Output:</span>{" "}
            {outputCategoryOptions.find(opt => opt.value === item.outputCategory)?.label || item.outputCategory}
          </p>
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
              {language === "ur" ? "???? ????" : "Start"}
            </Button>
          )}
          {item.status === "in_progress" && (
            <Button
              size="sm"
              onClick={(e) => { e.stopPropagation(); handleComplete(item); }}
              data-testid={`button-complete-${item.id}`}
            >
              <CheckCircle className="h-3 w-3" />
              {language === "ur" ? "???? ????" : "Complete"}
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
                  <SkeletonBox key={i} className="h-32 w-full" />
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
                  <SkeletonBox key={i} className="h-32 w-full" />
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
                  <SkeletonBox key={i} className="h-32 w-full" />
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {language === "ur" ? "??? ????????" : "New Processing"}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Create a processing batch by selecting a raw source product and a bio output product.
            </DialogDescription>
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
                        {products.map((p) => (
                          <SelectItem key={p.id} value={p.id.toString()}>
                            {p.name} ({parseFloat(p.currentStock).toLocaleString()} {p.unit})
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
                        {bioProducts.length === 0 ? (
                          <SelectItem value="none" disabled>No bio products found. Add Bio products first.</SelectItem>
                        ) : (
                          bioProducts.map((p) => (
                            <SelectItem key={p.id} value={p.id.toString()}>
                              {p.name}
                            </SelectItem>
                          ))
                        )}
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {language === "ur" ? "???????? ???? ????" : "Complete Processing"}
            </DialogTitle>
          </DialogHeader>
          <Form {...completeForm}>
            <form onSubmit={completeForm.handleSubmit((data) => 
              completeMutation.mutate({ ...data, id: selectedProcessing!.id })
            )} className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <FormLabel>{t("outputProduct")}</FormLabel>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => outputFields.append({ productId: "", quantity: "" })}
                    data-testid="button-add-output"
                  >
                    <Plus className="h-4 w-4" />
                    {language === "ur" ? "?? ????? ????" : "Add output"}
                  </Button>
                </div>

                {outputFields.fields.map((fieldItem, index) => (
                  <div key={fieldItem.id} className="flex items-start gap-2">
                    <FormField
                      control={completeForm.control}
                      name={`outputs.${index}.productId`}
                      render={({ field }) => (
                        <FormItem className="flex-1">
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger data-testid={`select-complete-output-${index}`}>
                                <SelectValue placeholder={language === "ur" ? "????? ????" : "Select product"} />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {bioProducts.length === 0 ? (
                                <SelectItem value="none" disabled>No bio products found. Add Bio products first.</SelectItem>
                              ) : (
                                bioProducts.map((p) => (
                                  <SelectItem key={p.id} value={p.id.toString()}>
                                    {p.name}
                                  </SelectItem>
                                ))
                              )}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={completeForm.control}
                      name={`outputs.${index}.quantity`}
                      render={({ field }) => (
                        <FormItem className="w-32">
                          <FormControl>
                            <Input
                              {...field}
                              type="number"
                              step="0.01"
                              placeholder="kg"
                              data-testid={`input-output-quantity-${index}`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      disabled={outputFields.fields.length === 1}
                      onClick={() => outputFields.remove(index)}
                      data-testid={`button-remove-output-${index}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}

                {completeForm.formState.errors.outputs?.message && (
                  <p className="text-sm font-medium text-destructive">
                    {completeForm.formState.errors.outputs.message}
                  </p>
                )}
              </div>
              <FormField
                control={completeForm.control}
                name="outputCategory"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Output Type</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-output-category">
                          <SelectValue placeholder="Select output type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {outputCategoryOptions.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
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
                  {completeMutation.isPending ? t("loading") : (language === "ur" ? "???? ????" : "Complete")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailProcessing} onOpenChange={(open) => !open && setDetailProcessing(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right" : ""}>
              {detailProcessing?.batchNumber || "Processing Details"}
            </DialogTitle>
          </DialogHeader>
          {detailProcessing && (
            <div className="space-y-3">
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
                <div className="col-span-2">
                  <p className="text-muted-foreground">Conversion</p>
                  <p className="font-medium flex items-center gap-2">
                    {detailProcessing.sourceProduct?.name || "-"}
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    {detailProcessing.outputProduct?.name || "-"}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Output</p>
                  {detailProcessing.outputs?.length ? (
                    <ul className="space-y-0.5">
                      {detailProcessing.outputs.map((output) => (
                        <li key={output.id} className="font-medium">
                          {output.product?.name || `#${output.productId}`}{" "}
                          <span className="font-mono text-muted-foreground">
                            {parseFloat(output.quantity).toLocaleString()} kg
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="font-medium">{detailProcessing.outputProduct?.name || "-"}</p>
                  )}
                  {detailProcessing.outputCategory && (
                    <p className="text-xs text-muted-foreground">
                      {outputCategoryOptions.find(opt => opt.value === detailProcessing.outputCategory)?.label || detailProcessing.outputCategory}
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-muted-foreground">Input Qty (kg)</p>
                  <p className="font-mono">{parseFloat(detailProcessing.sourceQuantity).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Output Qty (kg)</p>
                  <p className="font-mono">
                    {totalOutputQuantity(detailProcessing)
                      ? totalOutputQuantity(detailProcessing).toLocaleString()
                      : "—"}
                  </p>
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
    </div>
  );
}
