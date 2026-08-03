import { useMemo, useState } from "react";
import { Plus, Edit, Package, Scale, Trash2, Search } from "lucide-react";
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
import type { Product } from "@/types/schema";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";

// Mirrors the server rule: amounts must be complete, non-negative numbers.
const nonNegativeAmount = (label: string) =>
  z.coerce
    .string()
    .default("0")
    .refine((value) => value === "" || /^[+]?(\d+(\.\d*)?|\.\d+)$/.test(value.trim()), {
      message: `${label} must be a number`,
    })
    .refine((value) => value === "" || parseFloat(value) >= 0, {
      message: `${label} cannot be negative`,
    });

const productFormSchema = z.object({
  name: z.string().trim().min(1, "Product name is required").max(150),
  nameUrdu: z.string().trim().max(150).optional(),
  productType: z.enum(["raw", "bio"]).default("raw"),
  unit: z.string().min(1, "Unit is required").default("kg"),
  salePrice: nonNegativeAmount("Sale price"),
  currentStock: nonNegativeAmount("Opening stock"),
  avgPurchasePrice: nonNegativeAmount("Average purchase price"),
});

type ProductFormData = z.infer<typeof productFormSchema>;

export default function ProductsPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | "raw" | "bio">("all");
  const [sortOption, setSortOption] = useState<"name-asc" | "name-desc" | "price-asc" | "price-desc">("name-asc");

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      nameUrdu: "",
      productType: "raw",
      unit: "kg",
      salePrice: "0",
      currentStock: "0",
      avgPurchasePrice: "0",
    },
  });

  const {
    data: products = [],
    isLoading,
    isError,
    error: loadError,
    refetch,
  } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const filteredProducts = useMemo(() => {
    const list = [...products];
    const q = searchQuery.trim().toLowerCase();
    const searched = q
      ? list.filter((p) => {
          const haystack = [p.name, p.nameUrdu, p.productType, p.unit]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(q);
        })
      : list;
    let filtered =
      typeFilter === "all"
        ? searched
        : searched.filter((p) => (p.productType || "").toLowerCase() === typeFilter);

    const compare = {
      "name-asc": (a: Product, b: Product) => a.name.localeCompare(b.name),
      "name-desc": (a: Product, b: Product) => b.name.localeCompare(a.name),
      "price-asc": (a: Product, b: Product) =>
        parseFloat(a.salePrice || "0") - parseFloat(b.salePrice || "0"),
      "price-desc": (a: Product, b: Product) =>
        parseFloat(b.salePrice || "0") - parseFloat(a.salePrice || "0"),
    }[sortOption];

    return filtered.sort(compare);
  }, [products, searchQuery, sortOption, typeFilter]);

  const createMutation = useMutation({
    mutationFn: async (data: ProductFormData) => {
      const payload = {
        ...data,
        productType: (data.productType || "raw").toLowerCase() as "raw" | "bio",
        currentStock: data.currentStock || "0",
        avgPurchasePrice: data.avgPurchasePrice || "0",
        salePrice: data.salePrice || "0",
      };
      const response = await apiRequest("POST", "/api/products", payload);
      return response.json() as Promise<Product>;
    },
    onSuccess: (createdProduct) => {
      queryClient.setQueryData<Product[]>(["/api/products"], (current = []) =>
        [...current.filter((product) => product.id !== createdProduct.id), createdProduct],
      );
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
    onError: (error) => {
      toast({
        title: language === "ur" ? "مصنوعات محفوظ نہیں ہو سکی" : "Product could not be saved",
        description: error instanceof Error ? error.message : "Please check the entered values and try again.",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/products/${id}`),
    onMutate: async (id: number) => {
      await queryClient.cancelQueries({ queryKey: ["/api/products"] });
      const previousProducts = queryClient.getQueryData<Product[]>(["/api/products"]);
      queryClient.setQueryData<Product[]>(["/api/products"], (old) =>
        old ? old.filter((p) => p.id !== id) : old
      );
      return { previousProducts };
    },
    onError: (err, _id, context) => {
      if (context?.previousProducts) {
        queryClient.setQueryData(["/api/products"], context.previousProducts);
      }
      // The server explains *why* (e.g. the product is referenced by invoices);
      // dropping that message left the user with no way to act on the failure.
      toast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    },
    onSuccess: () => {
      toast({ title: t("deletedSuccessfully") });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, currentStock: _currentStock, avgPurchasePrice: _avgPurchasePrice, ...data }: ProductFormData & { id: number }) => {
      const payload = {
        ...data,
        productType: (data.productType || "raw").toLowerCase() as "raw" | "bio",
        salePrice: data.salePrice || "0",
      };
      const response = await apiRequest("PATCH", `/api/products/${id}`, payload);
      return response.json() as Promise<Product>;
    },
    onSuccess: (updatedProduct) => {
      queryClient.setQueryData<Product[]>(["/api/products"], (current = []) =>
        current.map((product) => product.id === updatedProduct.id ? updatedProduct : product),
      );
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      setEditingProduct(null);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
    onError: (error) => {
      toast({
        title: language === "ur" ? "مصنوعات اپ ڈیٹ نہیں ہو سکی" : "Product could not be updated",
        description: error instanceof Error ? error.message : "Please check the entered values and try again.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: ProductFormData) => {
    if (editingProduct) {
      updateMutation.mutate({ ...data, id: editingProduct.id });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleEdit = (product: Product) => {
    setEditingProduct(product);
    const normalizedType: "raw" | "bio" =
      (product.productType || "").toLowerCase() === "bio" ? "bio" : "raw";
    form.reset({
      name: product.name,
      nameUrdu: product.nameUrdu || "",
      productType: normalizedType,
      unit: product.unit,
      salePrice: product.salePrice || "0",
      currentStock: product.currentStock || "0",
      avgPurchasePrice: product.avgPurchasePrice || "0",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingProduct(null);
    form.reset({
      name: "",
      nameUrdu: "",
      productType: "raw",
      unit: "kg",
      salePrice: "0",
      currentStock: "0",
      avgPurchasePrice: "0",
    });
    setIsDialogOpen(true);
  };

  const columns: Column<Product>[] = [
    {
      key: "name",
      title: "Product Name",
      titleUrdu: "مصنوعات کا نام",
      render: (item) => (
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Package className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="font-medium">{item.name}</p>
            {item.nameUrdu && (
              <p className="text-sm text-muted-foreground font-urdu">{item.nameUrdu}</p>
            )}
          </div>
        </div>
      ),
    },
    {
      key: "productType",
      title: "Type",
      align: "center",
      render: (item) => {
        const bioNames = new Set([
          "head rice",
          "broken rice",
          "rice polish",
          "kacher(nakoo)",
          "head white rice",
          "head brown rice",
          "white broken rice",
          "brown broken rice",
          "waste",
          "husk",
        ]);
        const typeValue = (item.productType || "").toLowerCase();
        const inferredBio = bioNames.has((item.name || "").trim().toLowerCase());
        const isBio = typeValue === "bio" || inferredBio;
        return (
          <Badge variant="outline">
            {isBio ? "Bio (Processed)" : "Raw"}
          </Badge>
        );
      },
    },
    {
      key: "unit",
      title: "Unit",
      titleUrdu: "یونٹ",
      align: "center",
      render: (item) => (
        <Badge variant="secondary" className="font-mono">
          {item.unit}
        </Badge>
      ),
    },
    {
      key: "currentStock",
      title: "Current Stock",
      titleUrdu: "موجودہ سٹاک",
      align: "right",
      render: (item) => {
        const stock = parseFloat(item.currentStock || "0");
        return (
          <div className={`flex items-center gap-2 justify-end ${isRTL ? "flex-row-reverse" : ""}`}>
            <Scale className="h-3 w-3 text-muted-foreground" />
            <span className="font-mono font-medium">
              {stock.toLocaleString()} {item.unit}
            </span>
          </div>
        );
      },
    },
    {
      key: "avgPurchasePrice",
      title: "Avg. Purchase Price",
      titleUrdu: "اوسط خریداری قیمت",
      align: "right",
      render: (item) => (
        <span className="font-mono text-sm text-muted-foreground">
          Rs. {parseFloat(item.avgPurchasePrice || "0").toLocaleString()}/{item.unit}
        </span>
      ),
    },
    {
      key: "salePrice",
      title: "Sale Price",
      titleUrdu: "فروخت قیمت",
      align: "right",
      render: (item) => (
        <span className="font-mono font-medium text-primary">
          Rs. {parseFloat(item.salePrice || "0").toLocaleString()}/{item.unit}
        </span>
      ),
    },
    {
      key: "actions",
      title: "Actions",
      titleUrdu: "ایکشنز",
      align: "center",
      render: (item) => (
        <div className="flex items-center justify-center gap-2">
          <Button
            size="icon"
            variant="ghost"
            onClick={(e) => {
              e.stopPropagation();
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
                  {t("delete")} {item.name}
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
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("products")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "چاول کی اقسام کا انتظام" : "Manage rice products and varieties"}
          </p>
        </div>
        <Button onClick={handleAddNew} data-testid="button-add-product">
          <Plus className="h-4 w-4" />
          {t("add")} {language === "ur" ? "مصنوعات" : "Product"}
        </Button>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div
            className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end sm:gap-6 mb-4 ${
              isRTL ? "sm:flex-row-reverse" : ""
            }`}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{t("filter") || "Filter"}</span>
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <FormControl>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="raw">Raw</SelectItem>
                  <SelectItem value="bio">Bio</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Sort</span>
              <Select value={sortOption} onValueChange={(v) => setSortOption(v as any)}>
                <FormControl>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="name-asc">Name (A → Z)</SelectItem>
                  <SelectItem value="name-desc">Name (Z → A)</SelectItem>
                  <SelectItem value="price-asc">Sale Price (Low → High)</SelectItem>
                  <SelectItem value="price-desc">Sale Price (High → Low)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {isError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <p className="text-sm text-destructive">
                {loadError instanceof Error ? loadError.message : "Failed to load products"}
              </p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                {language === "ur" ? "دوبارہ کوشش کریں" : "Retry"}
              </Button>
            </div>
          ) : (
            <DataTable
              columns={columns}
              data={filteredProducts}
              isLoading={isLoading}
              searchAlign="end"
              testIdPrefix="products"
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogDescription className="sr-only">
              Add or edit a product by providing names, product type, unit, and prices.
            </DialogDescription>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {editingProduct
                ? (language === "ur" ? "مصنوعات میں ترمیم" : "Edit Product")
                : (language === "ur" ? "نئی مصنوعات" : "New Product")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "انگریزی نام" : "English Name"}</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="e.g., Basmati Rice" data-testid="input-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="nameUrdu"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="font-urdu">اردو نام</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          placeholder="مثال: باسمتی چاول" 
                          className="font-urdu text-right" 
                          dir="rtl" 
                          data-testid="input-name-urdu" 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 gap-4">
                <FormField
                  control={form.control}
                  name="productType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "نوع" : "Product Type"}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value ?? "raw"}>
                        <FormControl>
                          <SelectTrigger data-testid="select-product-type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="raw">Raw</SelectItem>
                          <SelectItem value="bio">Bio (Processed product)</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "یونٹ" : "Unit"}</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-unit">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="kg">Kilogram (kg)</SelectItem>
                          <SelectItem value="mound">Mound (40 kg)</SelectItem>
                          <SelectItem value="quintal">Quintal (100 kg)</SelectItem>
                          <SelectItem value="ton">Ton (1000 kg)</SelectItem>
                          <SelectItem value="bag">Bag</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="salePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "فروخت قیمت (فی یونٹ)" : "Sale Price (per unit)"}</FormLabel>
                      <FormControl>
                        <Input {...field} type="number" step="0.01" data-testid="input-sale-price" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="currentStock"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "ابتدائی اسٹاک" : "Opening Stock"}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          disabled={Boolean(editingProduct)}
                          data-testid="input-opening-stock"
                        />
                      </FormControl>
                      {editingProduct && (
                        <p className="text-xs text-muted-foreground">
                          {language === "ur"
                            ? "موجودہ اسٹاک خرید، فروخت اور پروسیسنگ کے ذریعے تبدیل ہوتا ہے۔"
                            : "Current stock changes through purchases, sales, and processing transactions."}
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="avgPurchasePrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "اوسط خرید قیمت" : "Avg. Purchase Price"}</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          type="number"
                          step="0.01"
                          disabled={Boolean(editingProduct)}
                          data-testid="input-avg-price"
                        />
                      </FormControl>
                      {editingProduct && (
                        <p className="text-xs text-muted-foreground">
                          {language === "ur"
                            ? "اوسط خرید قیمت خریداری کی ٹرانزیکشنز سے حساب ہوتی ہے۔"
                            : "Average purchase price is calculated from purchase transactions."}
                        </p>
                      )}
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
                  {(createMutation.isPending || updateMutation.isPending) ? t("loading") : t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
