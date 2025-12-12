import { useState } from "react";
import { Plus, Play, CheckCircle, Package, ArrowRight, Scale, Factory } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/language-context";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
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
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Processing, Product } from "@shared/schema";
import { format } from "date-fns";

const processingFormSchema = z.object({
  sourceProductId: z.string().min(1, "Source product is required"),
  sourceQuantity: z.string().min(1, "Quantity is required"),
  outputProductId: z.string().optional(),
  notes: z.string().optional(),
});

const completeFormSchema = z.object({
  outputProductId: z.string().min(1, "Output product is required"),
  outputQuantity: z.string().min(1, "Output quantity is required"),
  wastageQuantity: z.string().default("0"),
});

type ProcessingFormData = z.infer<typeof processingFormSchema>;
type CompleteFormData = z.infer<typeof completeFormSchema>;

export default function ProcessingPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isCompleteDialogOpen, setIsCompleteDialogOpen] = useState(false);
  const [selectedProcessing, setSelectedProcessing] = useState<Processing | null>(null);

  const form = useForm<ProcessingFormData>({
    resolver: zodResolver(processingFormSchema),
    defaultValues: {
      sourceProductId: "",
      sourceQuantity: "",
      outputProductId: "same",
      notes: "",
    },
  });

  const completeForm = useForm<CompleteFormData>({
    resolver: zodResolver(completeFormSchema),
    defaultValues: {
      outputProductId: "",
      outputQuantity: "",
      wastageQuantity: "0",
    },
  });

  const { data: processingList = [], isLoading } = useQuery<(Processing & { sourceProduct?: Product; outputProduct?: Product })[]>({
    queryKey: ["/api/processing"],
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const createMutation = useMutation({
    mutationFn: (data: ProcessingFormData) =>
      apiRequest("POST", "/api/processing", {
        ...data,
        sourceProductId: parseInt(data.sourceProductId),
        outputProductId: data.outputProductId === "same"
          ? parseInt(data.sourceProductId)
          : data.outputProductId
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
        outputProductId: "same",
        notes: "",
      });
      toast({ title: t("savedSuccessfully") });
    },
  });

  const startMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/processing/${id}/start`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      toast({ title: language === "ur" ? "پروسیسنگ شروع ہو گئی" : "Processing started" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: (data: CompleteFormData & { id: number }) =>
      apiRequest("PATCH", `/api/processing/${data.id}/complete`, {
        outputProductId: parseInt(data.outputProductId),
        outputQuantity: data.outputQuantity,
        wastageQuantity: data.wastageQuantity,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/processing"] });
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsCompleteDialogOpen(false);
      setSelectedProcessing(null);
      completeForm.reset();
      toast({ title: language === "ur" ? "پروسیسنگ مکمل ہو گئی" : "Processing completed" });
    },
  });

  const handleAddNew = () => {
    form.reset();
    setIsDialogOpen(true);
  };

  const handleStart = (processing: Processing) => {
    startMutation.mutate(processing.id);
  };

  const handleComplete = (processing: Processing) => {
    setSelectedProcessing(processing);
    completeForm.reset({
      outputProductId: (processing.outputProductId ?? processing.sourceProductId).toString(),
      outputQuantity: "",
      wastageQuantity: "0",
    });
    setIsCompleteDialogOpen(true);
  };

  const pendingItems = processingList.filter(p => p.status === "pending");
  const inProgressItems = processingList.filter(p => p.status === "in_progress");
  const completedItems = processingList.filter(p => p.status === "completed");

  const ProcessingCard = ({ item }: { item: Processing & { sourceProduct?: Product; outputProduct?: Product } }) => (
    <Card className="hover-elevate" data-testid={`processing-card-${item.id}`}>
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
          {item.outputQuantity && (
            <>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-mono text-primary">{parseFloat(item.outputQuantity).toLocaleString()} kg</span>
            </>
          )}
        </div>

        {item.notes && (
          <p className="text-sm text-muted-foreground mb-3 truncate">{item.notes}</p>
        )}

        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          {item.status === "pending" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleStart(item)}
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
              onClick={() => handleComplete(item)}
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
            {language === "ur" ? "سٹاک پروسیسنگ کا انتظام" : "Manage stock processing workflow"}
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-processing">
          <Plus className="h-4 w-4" />
          {t("processStock")}
        </Button>
      </div>

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
                {language === "ur" ? "کوئی زیر التواء آئٹم نہیں" : "No pending items"}
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
                {language === "ur" ? "کوئی جاری پروسیسنگ نہیں" : "No items in progress"}
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
                {language === "ur" ? "کوئی مکمل آئٹم نہیں" : "No completed items"}
              </p>
            ) : (
              completedItems.slice(0, 5).map((item) => <ProcessingCard key={item.id} item={item} />)
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {language === "ur" ? "نئی پروسیسنگ" : "New Processing"}
            </DialogTitle>
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
                          <SelectValue placeholder={language === "ur" ? "منتخب کریں" : "Select product"} />
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
                    <FormLabel>{t("outputProduct")} ({language === "ur" ? "اختیاری" : "Optional"})</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-output-product">
                          <SelectValue placeholder={language === "ur" ? "منتخب کریں" : "Select product"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="same">Same as source</SelectItem>
                        {products.map((p) => (
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
                    <FormLabel>{language === "ur" ? "نوٹس" : "Notes"}</FormLabel>
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
              {language === "ur" ? "پروسیسنگ مکمل کریں" : "Complete Processing"}
            </DialogTitle>
          </DialogHeader>
          <Form {...completeForm}>
            <form onSubmit={completeForm.handleSubmit((data) => 
              completeMutation.mutate({ ...data, id: selectedProcessing!.id })
            )} className="space-y-4">
              <FormField
                control={completeForm.control}
                name="outputProductId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("outputProduct")}</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-complete-output">
                          <SelectValue placeholder={language === "ur" ? "منتخب کریں" : "Select product"} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {products.map((p) => (
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
                control={completeForm.control}
                name="outputQuantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("outputQuantity")} (kg)</FormLabel>
                    <FormControl>
                      <Input {...field} type="number" step="0.01" data-testid="input-output-quantity" />
                    </FormControl>
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
                  {completeMutation.isPending ? t("loading") : (language === "ur" ? "مکمل کریں" : "Complete")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
