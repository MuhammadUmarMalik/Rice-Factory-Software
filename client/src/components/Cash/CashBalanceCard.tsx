import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { getSummary } from "@/api/cash.api";
import { Skeleton } from "@/components/ui/skeleton";
import { useLanguage } from "@/contexts/language-context";

type CardVariant = "opening" | "receipts" | "payments" | "balance";

export function CashBalanceCard({ variant }: { variant: CardVariant }) {
  const { t } = useLanguage();
  const { data, isLoading } = useQuery({ queryKey: ["/api/cash/summary"], queryFn: getSummary });

  const config: Record<CardVariant, { label: string; value: number; color: string }> = {
    opening: { label: "Opening Balance", value: data?.openingBalance ?? 0, color: "text-muted-foreground" },
    receipts: { label: "Total Receipts", value: data?.todayReceipts ?? 0, color: "text-emerald-600" },
    payments: { label: "Total Payments", value: data?.todayPayments ?? 0, color: "text-red-600" },
    balance: { label: "Closing Balance", value: data?.closingBalance ?? 0, color: "text-primary font-semibold" },
  };

  const { label, value, color } = config[variant];

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-4">
          <Skeleton className="h-4 w-24 mb-2" />
          <Skeleton className="h-8 w-32" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={variant === "balance" ? "border-primary/30 shadow-sm" : ""}>
      <CardContent className="pt-4 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-2xl font-mono ${color}`}>Rs. {value.toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
