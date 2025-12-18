import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/data-table";
import { useQuery } from "@tanstack/react-query";
import { useLanguage } from "@/contexts/language-context";
import { format } from "date-fns";
import { Wallet, ArrowDownRight, ArrowUpRight, ExternalLink } from "lucide-react";
import { useMemo } from "react";

type CashSummary = { opening: number; debit: number; credit: number; closing: number };
type CashTransaction = {
  id: number;
  transactionDate: string;
  transactionType: "DEBIT" | "CREDIT";
  referenceType?: string;
  referenceId?: number;
  amount: string;
  narration?: string;
};

export default function CashPage() {
  const { t } = useLanguage();

  const { data: summary } = useQuery<CashSummary>({
    queryKey: ["/api/cash/summary"],
  });

  const { data: transactions = [], isLoading } = useQuery<CashTransaction[]>({
    queryKey: ["/api/cash/transactions"],
  });

  const columns: Column<CashTransaction>[] = useMemo(
    () => [
      {
        key: "transactionDate",
        title: "Date",
        render: (item) => format(new Date(item.transactionDate), "dd MMM yyyy"),
      },
      {
        key: "narration",
        title: "Reference",
        render: (item) => (
          <div className="space-y-1">
            <div className="font-medium">{item.narration || "—"}</div>
            {item.referenceType && (
              <div className="text-xs text-muted-foreground flex items-center gap-1">
                <ExternalLink className="h-3 w-3" />
                {item.referenceType} #{item.referenceId}
              </div>
            )}
          </div>
        ),
      },
      {
        key: "debit",
        title: "Debit",
        align: "right",
        render: (item) =>
          item.transactionType === "DEBIT" ? (
            <div className="flex items-center gap-1 justify-end text-emerald-600 font-mono">
              <ArrowDownRight className="h-3 w-3" />
              {parseFloat(item.amount).toLocaleString()}
            </div>
          ) : (
            "—"
          ),
      },
      {
        key: "credit",
        title: "Credit",
        align: "right",
        render: (item) =>
          item.transactionType === "CREDIT" ? (
            <div className="flex items-center gap-1 justify-end text-red-600 font-mono">
              <ArrowUpRight className="h-3 w-3" />
              {parseFloat(item.amount).toLocaleString()}
            </div>
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("cashInHand")}</h1>
          <p className="text-sm text-muted-foreground">System-controlled cash ledger with full audit trail.</p>
        </div>
        <Badge variant="outline" className="flex items-center gap-1">
          <Wallet className="h-4 w-4" />
          Asset
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <SummaryCard label="Opening" value={summary?.opening} />
        <SummaryCard label="Cash In (Debit)" value={summary?.debit} tone="in" />
        <SummaryCard label="Cash Out (Credit)" value={summary?.credit} tone="out" />
        <SummaryCard label="Closing" value={summary?.closing} highlight />
      </div>

      <Card className="shadow-sm">
        <CardHeader>
          <CardTitle className="text-lg">Cash Transactions</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={transactions}
            isLoading={isLoading}
            searchable={false}
            emptyMessage="No cash movements yet"
            testIdPrefix="cash"
          />
        </CardContent>
      </Card>
    </div>
  );
}

function SummaryCard({ label, value, tone, highlight }: { label: string; value?: number; tone?: "in" | "out"; highlight?: boolean }) {
  const color =
    tone === "in" ? "text-emerald-600" : tone === "out" ? "text-red-600" : highlight ? "text-primary" : "text-foreground";
  return (
    <Card className={highlight ? "border-primary/30 shadow-sm" : ""}>
      <CardContent className="pt-4 space-y-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`text-2xl font-semibold font-mono ${color}`}>Rs. {(value ?? 0).toLocaleString()}</p>
      </CardContent>
    </Card>
  );
}
