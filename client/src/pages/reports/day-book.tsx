import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { PrintActions } from "@/components/print/PrintActions";
import { fetchWithAuth } from "@/lib/authFetch";
import { apiRequest } from "@/lib/apiRequest";
import { useToast } from "@/hooks/use-toast";
import { useReportDateRange } from "@/hooks/useReportDateRange";
import { getPresetRange } from "@/utils/dateRanges";
import { docKeys } from "@/print/docRegistry";

export type TabKey = "sales" | "purchases" | "cash" | "sales-returns" | "purchase-returns" | "general-journal";
type AnyRow = Record<string, any>;

const tabLabels: Record<TabKey, string> = {
  sales: "Sales Daybook",
  purchases: "Purchases Daybook",
  cash: "Cash Book",
  "sales-returns": "Sales Returns Daybook",
  "purchase-returns": "Purchase Returns Daybook",
  "general-journal": "General Journal",
};

const tabDescriptions: Record<TabKey, string> = {
  sales: "Track all credit sales, invoice statuses, receivables, and aging-ready balances.",
  purchases: "Track supplier credit purchases, due dates, and payables exposure.",
  cash: "Manage cash/bank receipts and payments with running balances per account.",
  "sales-returns": "Record customer returns and related credit note processing lifecycle.",
  "purchase-returns": "Record supplier returns and debit note settlement lifecycle.",
  "general-journal": "Post and review adjustment entries with balanced debit/credit lines.",
};

const statusOptions: Record<TabKey, string[]> = {
  sales: ["Pending", "Partially Paid", "Fully Paid"],
  purchases: ["Pending", "Partially Paid", "Fully Paid"],
  cash: ["Receipt", "Payment"],
  "sales-returns": ["Pending", "Processed", "Refunded"],
  "purchase-returns": ["Pending", "Processed", "Credited"],
  "general-journal": ["Draft", "Approved", "Reversed", "Cancelled"],
};

function formatMoney(value: any) {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0.00";
  return n.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: any) {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB");
}

function statusVariant(status?: string) {
  const s = (status || "").toLowerCase();
  if (s.includes("paid") || s.includes("approved") || s.includes("processed") || s.includes("credited") || s.includes("refunded")) return "default";
  if (s.includes("pending") || s.includes("draft")) return "secondary";
  if (s.includes("cancel") || s.includes("reverse")) return "destructive";
  return "outline";
}

async function parseApiError(res: Response, fallback: string) {
  const text = (await res.text()) || fallback;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed?.error === "string") return parsed.error;
    if (typeof parsed?.message === "string") return parsed.message;
  } catch {
    // ignore non-JSON responses
  }
  return text;
}

export type DayBookPageProps = {
  initialTab?: TabKey;
  singleTab?: boolean;
  pageTitle?: string;
};

export default function DayBookPage(props: DayBookPageProps & Record<string, unknown> = {}) {
  const { initialTab = "sales", singleTab = false, pageTitle } = props;
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const hasAutoSynced = useRef(false);
  const { range, setRange, fromDate, toDate } = useReportDateRange({ preset: "thisMonth" });
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [filters, setFilters] = useState({
    status: "",
    search: "",
  });

  const query = useQuery<AnyRow[]>({
    queryKey: ["/api/daybooks", tab, fromDate, toDate, filters.status, filters.search],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.set(key, value);
      });
      if (fromDate) params.set("dateFrom", fromDate);
      if (toDate) params.set("dateTo", toDate);
      const res = await fetchWithAuth(`/api/daybooks/${tab}?${params.toString()}`);
      if (!res.ok) throw new Error(await parseApiError(res, "Failed to load daybooks"));
      return res.json();
    },
  });

  const accountsQuery = useQuery<AnyRow[]>({
    queryKey: ["/api/accounts"],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/accounts");
      if (!res.ok) throw new Error(await parseApiError(res, "Failed to load accounts"));
      return res.json();
    },
  });

  const migrate = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/daybooks/migrate", {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/daybooks"] });
    },
    onError: (error: any) => toast({ title: "Sync failed", description: String(error?.message || error), variant: "destructive" }),
  });

  const rows = query.data || [];
  const visibleTabs = singleTab ? [tab] : (Object.keys(tabLabels) as TabKey[]);
  const currentTitle = pageTitle || (singleTab ? tabLabels[tab] : "Specialized Daybooks");

  useEffect(() => {
    if (!singleTab) return;
    setTab(initialTab);
  }, [initialTab, singleTab]);

  useEffect(() => {
    if (!query.error) return;
    toast({ title: "Failed to load records", description: String((query.error as any)?.message || query.error), variant: "destructive" });
  }, [query.error, toast]);

  const accountNameById = useMemo(() => {
    const map = new Map<number, string>();
    for (const account of accountsQuery.data || []) {
      const id = Number(account.id);
      if (Number.isFinite(id)) map.set(id, String(account.name || ""));
    }
    return map;
  }, [accountsQuery.data]);

  const resolvePartyName = (row: AnyRow) => {
    const raw = String(row.party_name ?? "").trim();
    const isGeneric = ["cash", "cash in hand", "cash account", "bank", "bank account", "unknown"].includes(raw.toLowerCase());
    if (raw && !/^\d+$/.test(raw) && !isGeneric) return raw;

    const rawId = Number(raw);
    if (Number.isFinite(rawId) && accountNameById.get(rawId)) return accountNameById.get(rawId);

    const bankId = Number(row.bank_account_id);
    if (Number.isFinite(bankId) && accountNameById.get(bankId)) return accountNameById.get(bankId);

    return "-";
  };

  useEffect(() => {
    if (hasAutoSynced.current) return;
    hasAutoSynced.current = true;
    migrate.mutate();
  }, [migrate]);
  const columns = useMemo<Column<AnyRow>[]>(() => {
    const base: Column<AnyRow>[] = [{ key: "id", title: "ID", align: "center" }];
    if (tab === "sales") {
      base.push(
        { key: "transaction_date", title: "Date", render: (row) => formatDate(row.transaction_date) },
        { key: "invoice_number", title: "Invoice" },
        { key: "customer_name", title: "Customer" },
        { key: "total_amount", title: "Total", align: "right", render: (row) => <span className="font-mono">{formatMoney(row.total_amount)}</span> },
        { key: "status", title: "Status", render: (row) => <Badge variant={statusVariant(row.status) as any}>{row.status}</Badge> },
      );
    } else if (tab === "purchases") {
      base.push(
        { key: "transaction_date", title: "Date", render: (row) => formatDate(row.transaction_date) },
        { key: "invoice_number", title: "Invoice" },
        { key: "supplier_name", title: "Supplier" },
        { key: "due_date", title: "Due Date", render: (row) => formatDate(row.due_date) },
        { key: "total_amount", title: "Total", align: "right", render: (row) => <span className="font-mono">{formatMoney(row.total_amount)}</span> },
        { key: "status", title: "Status", render: (row) => <Badge variant={statusVariant(row.status) as any}>{row.status}</Badge> },
      );
    } else if (tab === "cash") {
      base.push(
        { key: "transaction_date", title: "Date", render: (row) => formatDate(row.transaction_date) },
        { key: "transaction_type", title: "Type", render: (row) => <Badge variant={statusVariant(row.transaction_type) as any}>{row.transaction_type}</Badge> },
        { key: "account_type", title: "Account" },
        { key: "party_name", title: "Party", render: (row) => resolvePartyName(row) },
        { key: "amount", title: "Amount", align: "right", render: (row) => <span className="font-mono">{formatMoney(row.amount)}</span> },
        { key: "runningBalance", title: "Running", align: "right", render: (row) => <span className="font-mono">{formatMoney(row.runningBalance)}</span> },
      );
    } else if (tab === "sales-returns") {
      base.push(
        { key: "return_date", title: "Return Date", render: (row) => formatDate(row.return_date) },
        { key: "credit_note_number", title: "Credit Note" },
        { key: "customer_name", title: "Customer" },
        { key: "total_credit_amount", title: "Total Credit", align: "right", render: (row) => <span className="font-mono">{formatMoney(row.total_credit_amount)}</span> },
        { key: "status", title: "Status", render: (row) => <Badge variant={statusVariant(row.status) as any}>{row.status}</Badge> },
      );
    } else if (tab === "purchase-returns") {
      base.push(
        { key: "return_date", title: "Return Date", render: (row) => formatDate(row.return_date) },
        { key: "debit_note_number", title: "Debit Note" },
        { key: "supplier_name", title: "Supplier" },
        { key: "total_debit_amount", title: "Total Debit", align: "right", render: (row) => <span className="font-mono">{formatMoney(row.total_debit_amount)}</span> },
        { key: "status", title: "Status", render: (row) => <Badge variant={statusVariant(row.status) as any}>{row.status}</Badge> },
      );
    } else {
      base.push(
        { key: "transaction_date", title: "Date", render: (row) => formatDate(row.transaction_date) },
        { key: "journal_entry_number", title: "Entry No" },
        { key: "description", title: "Narration" },
        { key: "total_debits", title: "Debit", align: "right", render: (row) => <span className="font-mono">{formatMoney(row.total_debits)}</span> },
        { key: "total_credits", title: "Credit", align: "right", render: (row) => <span className="font-mono">{formatMoney(row.total_credits)}</span> },
        { key: "status", title: "Status", render: (row) => <Badge variant={statusVariant(row.status) as any}>{row.status}</Badge> },
      );
    }
    return base;
  }, [tab]);

  const summaryCards = useMemo(() => {
    const num = (v: any) => {
      const parsed = Number(v ?? 0);
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const money = (v: number) => formatMoney(v);

    if (tab === "sales") {
      const totalSales = rows.reduce((sum, row) => sum + num(row.total_amount), 0);
      const paid = rows.reduce((sum, row) => sum + num(row.paid_amount), 0);
      const pending = rows.filter((row) => row.status !== "Fully Paid").length;
      return [
        { label: "Total Credit Sales", value: money(totalSales) },
        { label: "Paid Amount", value: money(paid) },
        { label: "Outstanding", value: money(totalSales - paid) },
        { label: "Pending Invoices", value: String(pending) },
      ];
    }

    if (tab === "purchases") {
      const total = rows.reduce((sum, row) => sum + num(row.total_amount), 0);
      const paid = rows.reduce((sum, row) => sum + num(row.paid_amount), 0);
      const pending = rows.filter((row) => row.status !== "Fully Paid").length;
      return [
        { label: "Total Credit Purchases", value: money(total) },
        { label: "Paid Amount", value: money(paid) },
        { label: "Outstanding Payables", value: money(total - paid) },
        { label: "Pending Bills", value: String(pending) },
      ];
    }

    if (tab === "cash") {
      const receipts = rows.filter((row) => row.transaction_type === "Receipt").reduce((sum, row) => sum + num(row.amount), 0);
      const payments = rows.filter((row) => row.transaction_type === "Payment").reduce((sum, row) => sum + num(row.amount), 0);
      const accounts = new Set(rows.map((row) => row.runningBalanceKey || row.bank_account_name || row.account_type)).size;
      return [
        { label: "Total Receipts", value: money(receipts) },
        { label: "Total Payments", value: money(payments) },
        { label: "Net Balance", value: money(receipts - payments) },
        { label: "Cash/Bank Accounts", value: String(accounts) },
      ];
    }

    if (tab === "sales-returns") {
      const total = rows.reduce((sum, row) => sum + num(row.total_credit_amount), 0);
      const pending = rows.filter((row) => row.status === "Pending").length;
      const processed = rows.filter((row) => row.status === "Processed").length;
      const refunded = rows.filter((row) => row.status === "Refunded").length;
      return [
        { label: "Total Sales Returns", value: money(total) },
        { label: "Pending Returns", value: String(pending) },
        { label: "Processed Returns", value: String(processed) },
        { label: "Refunded Returns", value: String(refunded) },
      ];
    }

    if (tab === "purchase-returns") {
      const total = rows.reduce((sum, row) => sum + num(row.total_debit_amount), 0);
      const pending = rows.filter((row) => row.status === "Pending").length;
      const processed = rows.filter((row) => row.status === "Processed").length;
      const credited = rows.filter((row) => row.status === "Credited").length;
      return [
        { label: "Total Purchase Returns", value: money(total) },
        { label: "Pending Returns", value: String(pending) },
        { label: "Processed Returns", value: String(processed) },
        { label: "Credited Returns", value: String(credited) },
      ];
    }

    const totalDebits = rows.reduce((sum, row) => sum + num(row.total_debits), 0);
    const totalCredits = rows.reduce((sum, row) => sum + num(row.total_credits), 0);
    const approved = rows.filter((row) => row.status === "Approved").length;
    return [
      { label: "Journal Entries", value: String(rows.length) },
      { label: "Total Debits", value: money(totalDebits) },
      { label: "Total Credits", value: money(totalCredits) },
      { label: "Approved Entries", value: String(approved) },
    ];
  }, [tab, rows]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{currentTitle}</h1>
          <p className="text-sm text-muted-foreground">
            {singleTab ? tabDescriptions[tab] : "Sales, Purchases, Cash Book, Returns, and General Journal"}
          </p>
        </div>
        <div className="flex gap-2">
          <PrintActions
            docKey={docKeys.dayBook}
            params={{
              daybookType: "all",
              dateFrom: fromDate || undefined,
              dateTo: toDate || undefined,
            }}
            title="All Daybooks"
          />
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <Label>Date Range</Label>
              <DateRangeFilter value={range} onChange={setRange} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={filters.status || "all"} onValueChange={(v) => setFilters((s) => ({ ...s, status: v === "all" ? "" : v }))}>
                <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  {statusOptions[tab].map((opt) => <SelectItem key={opt} value={opt}>{opt}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Search</Label>
              <Input value={filters.search} onChange={(e) => setFilters((s) => ({ ...s, search: e.target.value }))} placeholder={`Search ${tabLabels[tab].toLowerCase()}...`} />
            </div>
          </div>
          <div className="mt-3 flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const today = getPresetRange("today");
                setRange({ preset: "today", from: today.from, to: today.to });
                setFilters({ status: "", search: "" });
              }}
            >
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tabLabels[tab]} Summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 md:grid-cols-4">
          {summaryCards.map((card) => (
            <div key={card.label} className="rounded border p-3">
              <div className="text-xs text-muted-foreground">{card.label}</div>
              <div className="text-lg font-semibold">{card.value}</div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(v) => !singleTab && setTab(v as TabKey)}>
        {!singleTab && (
          <TabsList className="flex h-auto w-full flex-wrap justify-start gap-2 bg-transparent p-0">
            {visibleTabs.map((key) => (
              <TabsTrigger key={key} value={key} className="border">{tabLabels[key]}</TabsTrigger>
            ))}
          </TabsList>
        )}
        {visibleTabs.map((key) => (
          <TabsContent key={key} value={key} className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{tabLabels[key]}</CardTitle>
                  <Badge variant="outline">{rows.length} records</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <DataTable
                  columns={columns}
                  data={rows}
                  isLoading={query.isLoading}
                  searchable={false}
                  emptyMessage={`No ${tabLabels[key].toLowerCase()} entries found`}
                  pageSize={20}
                />
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
