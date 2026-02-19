import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CashBalanceCard } from "@/components/Cash/CashBalanceCard";
import { CashReceiptForm } from "@/components/Cash/CashReceiptForm";
import { CashPaymentForm } from "@/components/Cash/CashPaymentForm";
import { useLanguage } from "@/contexts/language-context";
import { Plus, FileText } from "lucide-react";
import { Link } from "wouter";

export default function CashDashboardPage() {
  const { t } = useLanguage();
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("cashInHand")}</h1>
          <p className="text-sm text-muted-foreground">
            Cash receipts, payments, and journal vouchers with real-time balance
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setReceiptOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Receipt
          </Button>
          <Button variant="outline" onClick={() => setPaymentOpen(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Payment
          </Button>
          <Link href="/journal">
            <Button variant="outline">
              <FileText className="h-4 w-4 mr-2" /> Journal Voucher
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <CashBalanceCard variant="opening" />
        <CashBalanceCard variant="receipts" />
        <CashBalanceCard variant="payments" />
        <CashBalanceCard variant="balance" />
      </div>

      <CashReceiptForm open={receiptOpen} onOpenChange={setReceiptOpen} />
      <CashPaymentForm open={paymentOpen} onOpenChange={setPaymentOpen} />
    </div>
  );
}
