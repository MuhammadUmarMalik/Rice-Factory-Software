import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQuery } from "@tanstack/react-query";
import { getLedger } from "@/api/cash.api";
import { format } from "date-fns";
import { useLanguage } from "@/contexts/language-context";

export default function CashLedgerPage() {
  const { t } = useLanguage();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["/api/cash/ledger", from, to],
    queryFn: () => getLedger({ from: from || undefined, to: to || undefined }),
  });

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="p-6 space-y-6 print:p-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("cashLedger")}</h1>
          <p className="text-sm text-muted-foreground">Cash in / out ledger with running balance</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
          />
          <Input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
          />
          <Button variant="outline" size="sm" onClick={handlePrint} className="print:hidden">
            Export / Print
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="print:py-2">
          <CardTitle className="text-lg">Cash Ledger</CardTitle>
          {(from || to) && (
            <p className="text-sm text-muted-foreground">
              {from && to ? `${from} to ${to}` : from || to}
            </p>
          )}
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">Date</th>
                  <th className="text-left p-3 font-medium">Voucher No</th>
                  <th className="text-left p-3 font-medium">Description</th>
                  <th className="text-left p-3 font-medium">Reference</th>
                  <th className="text-right p-3 font-medium">Debit (In)</th>
                  <th className="text-right p-3 font-medium">Credit (Out)</th>
                  <th className="text-right p-3 font-medium">Balance</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted-foreground">
                      No transactions
                    </td>
                  </tr>
                ) : (
                  rows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`border-b hover:bg-muted/30 ${
                        row.type === "receipt" ? "bg-emerald-50/50 dark:bg-emerald-950/20" : ""
                      } ${row.type === "payment" ? "bg-red-50/50 dark:bg-red-950/20" : ""}`}
                    >
                      <td className="p-3">
                        {row.date ? format(new Date(row.date), "dd MMM yyyy") : "—"}
                      </td>
                      <td className="p-3 font-mono text-xs">{row.voucherNo || "—"}</td>
                      <td className="p-3">{row.description}</td>
                      <td className="p-3 text-muted-foreground">{row.reference || "—"}</td>
                      <td className="p-3 text-right font-mono text-emerald-600">
                        {row.debit > 0 ? row.debit.toLocaleString() : "—"}
                      </td>
                      <td className="p-3 text-right font-mono text-red-600">
                        {row.credit > 0 ? row.credit.toLocaleString() : "—"}
                      </td>
                      <td className="p-3 text-right font-mono font-medium">
                        {row.balance.toLocaleString()}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
