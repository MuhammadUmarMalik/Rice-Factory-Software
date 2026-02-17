import { Plus, Eye, Truck, Edit, Trash2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { Purchase, Account } from "@/types/schema";
import { format } from "date-fns";

export type PurchaseWithSupplier = Purchase & { supplier?: Account };

export interface PurchasesListProps {
  purchases: PurchaseWithSupplier[];
  isLoading: boolean;
  onAddNew: () => void;
  onView: (purchase: Purchase) => void;
  onEdit: (purchase: Purchase) => void;
  onDelete: (purchase: Purchase) => void;
  isDeleting?: boolean;
  t: (key: string) => string;
}

export function PurchasesList({
  purchases,
  isLoading,
  onAddNew,
  onView,
  onEdit,
  onDelete,
  isDeleting = false,
  t,
}: PurchasesListProps) {
  const { isRTL } = useLanguage();

  const columns: Column<PurchaseWithSupplier>[] = [
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
            onClick={() => onView(item)}
            data-testid={`button-view-${item.id}`}
            title="View"
          >
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => onEdit(item)}
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
                <AlertDialogCancel disabled={isDeleting}>
                  {t("cancel")}
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => onDelete(item)}
                  disabled={isDeleting}
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
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""} screen-only`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("purchases")}</h1>
          <p className="text-sm text-muted-foreground">Manage purchase orders</p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button onClick={onAddNew} data-testid="button-add-purchase">
            <Plus className="h-4 w-4" />
            {t("newPurchase")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <DataTable
            columns={columns}
            data={purchases}
            isLoading={isLoading}
            testIdPrefix="purchases"
          />
        </CardContent>
      </Card>
    </div>
  );
}
