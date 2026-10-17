import { PAKISTAN_BANK_OPTIONS } from "@/lib/pakistan-banks";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format, startOfDay } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateApi } from "@/api/invalidation";
import type { Account } from "@/types/schema";

type Status = "pending" | "deposited" | "cleared" | "bounced" | "cancelled";
type Direction = "received" | "issued";

type Cheque = {
  id: number;
  direction: Direction;
  partyId: number | null;
  partyName: string | null;
  chequeNo: string;
  bankName: string | null;
  amount: string;
  chequeDate: number;
  status: Status;
  notes: string | null;
};

/** Must match NEXT_STATUS in server/controllers/cheques.controller.ts. */
const NEXT_STATUS: Record<Status, Status[]> = {
  pending: ["deposited", "cleared", "bounced", "cancelled"],
  deposited: ["cleared", "bounced"],
  bounced: ["pending", "cancelled"],
  cleared: [],
  cancelled: [],
};

const STATUS_LABEL: Record<Status, string> = {
  pending: "Pending",
  deposited: "Deposited",
  cleared: "Cleared",
  bounced: "Bounced",
  cancelled: "Cancelled",
};

const statusVariant = (s: Status) =>
  s === "cleared" ? "default" : s === "bounced" ? "destructive" : s === "cancelled" ? "outline" : "secondary";

const NONE = "none";
const ALL = "all";
const blankForm = { direction: "received" as Direction, partyId: NONE, chequeNo: "", bankName: "", amount: "", chequeDate: "", notes: "" };

export default function ChequesPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const [form, setForm] = useState(blankForm);
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const [directionFilter, setDirectionFilter] = useState<string>(ALL);

  const { data: cheques = [], isLoading } = useQuery<Cheque[]>({
    queryKey: [`/api/cheques?status=${statusFilter}&direction=${directionFilter}`],
  });
  const { data: parties = [] } = useQuery<Account[]>({
    queryKey: [`/api/accounts?type=${form.direction === "received" ? "customer" : "supplier"}`],
  });

  const onError = (error: unknown) => toast({ title: "Failed", description: (error as Error).message, variant: "destructive" });
  const refresh = () => invalidateApi(["/api/cheques", "/api/dashboard/alerts"]);

  const create = useMutation({
    mutationFn: () =>
      apiRequest("POST", "/api/cheques", {
        ...form,
        partyId: form.partyId === NONE ? null : Number(form.partyId),
      }),
    onSuccess: () => {
      refresh();
      setForm({ ...blankForm, direction: form.direction });
      toast({ title: "Cheque added" });
    },
    onError,
  });

  const setStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: Status }) =>
      apiRequest("PATCH", `/api/cheques/${id}/status`, { status }),
    onSuccess: refresh,
    onError,
  });

  const remove = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/cheques/${id}`),
    onSuccess: refresh,
    onError,
  });

  const today = startOfDay(new Date()).getTime();
  const pendingTotal = (dir: Direction) =>
    cheques.filter((c) => c.direction === dir && c.status === "pending").reduce((s, c) => s + Number(c.amount), 0);

  const columns: Column<Cheque>[] = useMemo(
    () => [
      {
        key: "chequeDate",
        title: "Cheque date",
        render: (c) => {
          const overdue = c.status === "pending" && c.chequeDate < today;
          return (
            <span className={`font-mono ${overdue ? "font-semibold text-destructive" : ""}`}>
              {format(new Date(c.chequeDate), "dd-MM-yyyy")}
            </span>
          );
        },
      },
      { key: "direction", title: "Type", render: (c) => (c.direction === "received" ? "Received" : "Issued") },
      { key: "partyName", title: "Party", render: (c) => c.partyName ?? "—" },
      { key: "chequeNo", title: "Cheque #", render: (c) => <span className="font-mono">{c.chequeNo}</span> },
      { key: "bankName", title: "Bank", render: (c) => c.bankName ?? "—" },
      {
        key: "amount",
        title: "Amount",
        align: "right",
        render: (c) => <span className="font-mono">Rs. {Number(c.amount).toLocaleString()}</span>,
      },
      { key: "status", title: "Status", render: (c) => <Badge variant={statusVariant(c.status)}>{STATUS_LABEL[c.status]}</Badge> },
      {
        key: "id",
        title: "",
        render: (c) => (
          <div className="flex flex-wrap justify-end gap-1">
            {NEXT_STATUS[c.status].map((next) => (
              <Button
                key={next}
                size="sm"
                variant={next === "bounced" || next === "cancelled" ? "ghost" : "outline"}
                disabled={setStatus.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  setStatus.mutate({ id: c.id, status: next });
                }}
              >
                {STATUS_LABEL[next]}
              </Button>
            ))}
            {(c.status === "pending" || c.status === "cancelled") && (
              <Button
                size="sm"
                variant="ghost"
                className="text-destructive"
                disabled={remove.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  remove.mutate(c.id);
                }}
              >
                Delete
              </Button>
            )}
          </div>
        ),
      },
    ],
    [today, setStatus, remove],
  );

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value }),
  });

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("chequeRegister")}</h1>
        <p className="text-sm text-muted-foreground">
          Tracks post-dated cheques until they clear. It does not post to the books. Enter the receipt or payment
          voucher as usual when the money moves.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="pt-4 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending to receive (shown)</p>
            <p className="text-2xl font-semibold font-mono">Rs. {pendingTotal("received").toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 space-y-1">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">Pending to pay (shown)</p>
            <p className="text-2xl font-semibold font-mono">Rs. {pendingTotal("issued").toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Add cheque</CardTitle>
          <CardDescription>Received from a customer, or issued to a supplier.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 md:grid-cols-4"
            onSubmit={(e) => {
              e.preventDefault();
              create.mutate();
            }}
          >
            <div className="space-y-1">
              <Label>Type</Label>
              <Select
                value={form.direction}
                onValueChange={(v) => setForm({ ...form, direction: v as Direction, partyId: NONE })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="received">Received</SelectItem>
                  <SelectItem value="issued">Issued</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{form.direction === "received" ? "Customer" : "Supplier"}</Label>
              <Select value={form.partyId} onValueChange={(v) => setForm({ ...form, partyId: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>—</SelectItem>
                  {parties.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="chq-no">Cheque #</Label>
              <Input id="chq-no" required {...field("chequeNo")} />
            </div>
            <div className="space-y-1">
              <Label>Bank</Label>
              <SearchableSelect
                options={PAKISTAN_BANK_OPTIONS}
                value={form.bankName}
                onValueChange={(bankName) => setForm({ ...form, bankName })}
                allowCustom
                placeholder="Select bank"
                searchPlaceholder="Search bank or type a name..."
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="chq-amount">Amount (Rs.)</Label>
              <Input id="chq-amount" type="number" min="1" step="0.01" required {...field("amount")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="chq-date">Cheque date</Label>
              <Input id="chq-date" type="date" required {...field("chequeDate")} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="chq-notes">Notes</Label>
              <Input id="chq-notes" {...field("notes")} />
            </div>
            <div className="flex items-end">
              <Button type="submit" className="w-full" disabled={create.isPending}>
                Add cheque
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <CardTitle className="text-lg">Cheques</CardTitle>
          <div className="flex gap-2">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All statuses</SelectItem>
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={directionFilter} onValueChange={setDirectionFilter}>
              <SelectTrigger className="w-36">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>Both</SelectItem>
                <SelectItem value="received">Received</SelectItem>
                <SelectItem value="issued">Issued</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={cheques} isLoading={isLoading} searchable emptyMessage="No cheques" />
        </CardContent>
      </Card>
    </div>
  );
}
