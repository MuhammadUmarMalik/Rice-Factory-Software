import { useState } from "react";
import { Download, Printer, ArrowUpRight, ArrowDownRight, Wallet, Calendar } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useQuery } from "@tanstack/react-query";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Account, LedgerEntry } from "@shared/schema";
import { format } from "date-fns";

export default function LedgerPage() {
  const { t, isRTL, language } = useLanguage();
  const [selectedAccountId, setSelectedAccountId] = useState<string>("");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const { data: ledgerEntries = [], isLoading } = useQuery<LedgerEntry[]>({
    queryKey: ["/api/ledger", selectedAccountId],
    enabled: !!selectedAccountId,
  });

  const selectedAccount = accounts.find(a => a.id.toString() === selectedAccountId);

  const filteredEntries = ledgerEntries.filter(entry => {
    if (dateFrom && new Date(entry.entryDate) < new Date(dateFrom)) return false;
    if (dateTo && new Date(entry.entryDate) > new Date(dateTo)) return false;
    return true;
  });

  const totalDebit = filteredEntries
    .filter(e => e.transactionType === "debit")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  const totalCredit = filteredEntries
    .filter(e => e.transactionType === "credit")
    .reduce((sum, e) => sum + parseFloat(e.amount), 0);

  const columns: Column<LedgerEntry>[] = [
    {
      key: "entryDate",
      title: "Date",
      titleUrdu: "تاریخ",
      render: (item) => (
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Calendar className="h-3 w-3 text-muted-foreground" />
          <span className="text-sm font-mono">
            {format(new Date(item.entryDate), "dd MMM yyyy")}
          </span>
        </div>
      ),
    },
    {
      key: "description",
      title: "Description",
      titleUrdu: "تفصیل",
      render: (item) => (
        <div>
          <p className="text-sm">{isRTL && item.descriptionUrdu ? item.descriptionUrdu : item.description}</p>
          {item.referenceType && (
            <p className="text-xs text-muted-foreground font-mono">
              {item.referenceType}: #{item.referenceId}
            </p>
          )}
        </div>
      ),
    },
    {
      key: "debit",
      title: "Debit",
      titleUrdu: "ڈیبٹ",
      align: "right",
      render: (item) => (
        item.transactionType === "debit" ? (
          <div className={`flex items-center gap-1 justify-end text-destructive ${isRTL ? "flex-row-reverse" : ""}`}>
            <ArrowUpRight className="h-3 w-3" />
            <span className="font-mono font-medium">
              Rs. {parseFloat(item.amount).toLocaleString()}
            </span>
          </div>
        ) : null
      ),
    },
    {
      key: "credit",
      title: "Credit",
      titleUrdu: "کریڈٹ",
      align: "right",
      render: (item) => (
        item.transactionType === "credit" ? (
          <div className={`flex items-center gap-1 justify-end text-primary ${isRTL ? "flex-row-reverse" : ""}`}>
            <ArrowDownRight className="h-3 w-3" />
            <span className="font-mono font-medium">
              Rs. {parseFloat(item.amount).toLocaleString()}
            </span>
          </div>
        ) : null
      ),
    },
    {
      key: "balance",
      title: "Balance",
      titleUrdu: "بیلنس",
      align: "right",
      render: (item) => {
        const balance = parseFloat(item.balance);
        return (
          <span className={`font-mono font-medium ${balance >= 0 ? "" : "text-destructive"}`}>
            Rs. {Math.abs(balance).toLocaleString()}
            {balance < 0 ? " Cr" : " Dr"}
          </span>
        );
      },
    },
  ];

  const customersAndSuppliers = accounts.filter(a => a.type === "customer" || a.type === "supplier");

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("ledger")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur" ? "پارٹی کھاتہ" : "Party account ledger"}
          </p>
        </div>
        <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button variant="outline" disabled={!selectedAccountId} data-testid="button-export">
            <Download className="h-4 w-4" />
            {t("export")}
          </Button>
          <Button variant="outline" disabled={!selectedAccountId} data-testid="button-print">
            <Printer className="h-4 w-4" />
            {t("print")}
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className={`grid gap-4 md:grid-cols-4 ${isRTL ? "direction-rtl" : ""}`}>
            <div className="md:col-span-2">
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "پارٹی منتخب کریں" : "Select Party"}
              </Label>
              <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
                <SelectTrigger data-testid="select-account">
                  <SelectValue placeholder={language === "ur" ? "پارٹی منتخب کریں" : "Select a party"} />
                </SelectTrigger>
                <SelectContent>
                  {customersAndSuppliers.map((account) => (
                    <SelectItem key={account.id} value={account.id.toString()}>
                      <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                        <Badge variant={account.type === "customer" ? "default" : "secondary"} className="text-xs">
                          {account.type === "customer" ? t("customer") : t("supplier")}
                        </Badge>
                        {account.name} {account.nameUrdu && `(${account.nameUrdu})`}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "تاریخ سے" : "From Date"}
              </Label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                data-testid="input-date-from"
              />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "تاریخ تک" : "To Date"}
              </Label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                data-testid="input-date-to"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedAccount && (
        <>
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("openingBalance")}
                </CardTitle>
                <Wallet className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
                  Rs. {parseFloat(selectedAccount.openingBalance || "0").toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {language === "ur" ? "کل ڈیبٹ" : "Total Debit"}
                </CardTitle>
                <ArrowUpRight className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold font-mono text-destructive ${isRTL ? "text-right" : ""}`}>
                  Rs. {totalDebit.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {language === "ur" ? "کل کریڈٹ" : "Total Credit"}
                </CardTitle>
                <ArrowDownRight className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold font-mono text-primary ${isRTL ? "text-right" : ""}`}>
                  Rs. {totalCredit.toLocaleString()}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className={`flex flex-row items-center justify-between gap-2 pb-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {t("currentBalance")}
                </CardTitle>
                <Wallet className="h-4 w-4 text-primary" />
              </CardHeader>
              <CardContent>
                <div className={`text-xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
                  Rs. {parseFloat(selectedAccount.currentBalance || "0").toLocaleString()}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className={isRTL ? "text-right" : ""}>
              <CardTitle className="text-base">
                {selectedAccount.name} {selectedAccount.nameUrdu && (
                  <span className="font-urdu text-muted-foreground">({selectedAccount.nameUrdu})</span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <DataTable
                columns={columns}
                data={filteredEntries}
                isLoading={isLoading}
                searchable={false}
                testIdPrefix="ledger"
                emptyMessage={language === "ur" ? "کوئی انٹری نہیں ملی" : "No entries found"}
              />
            </CardContent>
          </Card>
        </>
      )}

      {!selectedAccountId && (
        <Card>
          <CardContent className="py-12 text-center">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className={`text-muted-foreground ${isRTL ? "font-urdu" : ""}`}>
              {language === "ur" ? "کھاتہ دیکھنے کے لیے پارٹی منتخب کریں" : "Select a party to view their ledger"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
