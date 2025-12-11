import { useState } from "react";
import { Plus, Edit, Package, Scale } from "lucide-react";
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
import type { Product } from "@shared/schema";

const productFormSchema = z.object({
  name: z.string().min(1, "Product name is required"),
  nameUrdu: z.string().optional(),
  unit: z.string().default("kg"),
  salePrice: z.string().default("0"),
});

type ProductFormData = z.infer<typeof productFormSchema>;

export default function ProductsPage() {
  const { t, isRTL, language } = useLanguage();
  const { toast } = useToast();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const form = useForm<ProductFormData>({
    resolver: zodResolver(productFormSchema),
    defaultValues: {
      name: "",
      nameUrdu: "",
      unit: "kg",
      salePrice: "0",
    },
  });

  const { data: products = [], isLoading } = useQuery<Product[]>({
    queryKey: ["/api/products"],
  });

  const createMutation = useMutation({
    mutationFn: (data: ProductFormData) =>
      apiRequest("POST", "/api/products", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      form.reset();
      toast({ title: t("savedSuccessfully") });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: ProductFormData & { id: number }) =>
      apiRequest("PATCH", `/api/products/${data.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/products"] });
      setIsDialogOpen(false);
      setEditingProduct(null);
      form.reset();
      toast({ title: t("savedSuccessfully") });
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
    form.reset({
      name: product.name,
      nameUrdu: product.nameUrdu || "",
      unit: product.unit,
      salePrice: product.salePrice || "0",
    });
    setIsDialogOpen(true);
  };

  const handleAddNew = () => {
    setEditingProduct(null);
    form.reset({
      name: "",
      nameUrdu: "",
      unit: "kg",
      salePrice: "0",
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
          <DataTable
            columns={columns}
            data={products}
            isLoading={isLoading}
            testIdPrefix="products"
          />
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className={isRTL ? "text-right font-urdu" : ""}>
              {editingProduct
                ? (language === "ur" ? "مصنوعات میں ترمیم" : "Edit Product")
                : (language === "ur" ? "نئی مصنوعات" : "New Product")}
            </DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
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
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{language === "ur" ? "یونٹ" : "Unit"}</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger data-testid="select-unit">
                            <SelectValue placeholder="Select unit" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="kg">Kilogram (kg)</SelectItem>
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
