import { Fragment, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import History from "lucide-react/dist/esm/icons/history";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SkeletonBox } from "@/components/ui/skeletons";
import { useLanguage } from "@/contexts/language-context";
import { fetchWithAuth } from "@/lib/authFetch";

type AuditRow = {
  id: number;
  entity: string;
  entityId: number | null;
  action: string;
  beforeJson: string | null;
  afterJson: string | null;
  performedByName: string | null;
  performedAt: number;
};

type AuditResponse = { rows: AuditRow[]; total: number; entities: string[]; actions: string[] };

const PAGE = 50;
const ALL = "all";

const ENTITY_LABELS: Record<string, string> = {
  CP: "Cash Payment",
  CR: "Cash Receipt",
  journal_voucher: "Journal Voucher",
  gate_pass: "Gate Pass",
  purchase: "Purchase",
  sale: "Sale",
  payroll: "Payroll",
};
const entityLabel = (e: string) => ENTITY_LABELS[e] ?? e;

function parse(json: string | null): Record<string, unknown> | null {
  if (!json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : { value: v };
  } catch {
    return { value: json };
  }
}

const show = (v: unknown) => (v == null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));

/** Top-level fields whose value differs. For a create/delete that is every field on the one side present. */
function changedFields(row: AuditRow) {
  const before = parse(row.beforeJson) ?? {};
  const after = parse(row.afterJson) ?? {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((k) => ({ key: k, before: before[k], after: after[k] }));
}

const actionVariant = (a: string) =>
  a.includes("delete") ? "destructive" : a === "create" || a === "generated" ? "default" : "secondary";

export default function AuditLogPage() {
  const { t, isRTL } = useLanguage();
  const [entity, setEntity] = useState(ALL);
  const [action, setAction] = useState(ALL);
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState<number | null>(null);

  const { data, isLoading } = useQuery<AuditResponse>({
    queryKey: ["/api/audit-logs", entity, action, fromDate, toDate, page],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: String(PAGE), offset: String(page * PAGE) });
      if (entity !== ALL) params.set("entity", entity);
      if (action !== ALL) params.set("action", action);
      if (fromDate) params.set("fromDate", fromDate);
      if (toDate) params.set("toDate", toDate);
      const res = await fetchWithAuth(`/api/audit-logs?${params}`);
      if (!res.ok) throw new Error("Failed to fetch audit logs");
      return res.json();
    },
    placeholderData: (prev) => prev,
  });

  const filter = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(0);
  };
  const total = data?.total ?? 0;
  const lastPage = Math.max(Math.ceil(total / PAGE) - 1, 0);

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
        <History className="h-5 w-5" />
        <h1 className="text-2xl font-semibold">{t("auditLog")}</h1>
      </div>

      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-4">
          <div className="space-y-1">
            <Label>Record type</Label>
            <Select value={entity} onValueChange={filter(setEntity)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {(data?.entities ?? []).map((e) => (
                  <SelectItem key={e} value={e}>
                    {entityLabel(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Action</Label>
            <Select value={action} onValueChange={filter(setAction)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All</SelectItem>
                {(data?.actions ?? []).map((a) => (
                  <SelectItem key={a} value={a}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-from">From</Label>
            <Input id="audit-from" type="date" value={fromDate} onChange={(e) => filter(setFromDate)(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="audit-to">To</Label>
            <Input id="audit-to" type="date" value={toDate} onChange={(e) => filter(setToDate)(e.target.value)} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className={`flex flex-row items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
          <CardTitle className="text-base font-semibold">{total.toLocaleString()} changes</CardTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
              Previous
            </Button>
            <span className="text-sm text-muted-foreground">
              {page + 1} / {lastPage + 1}
            </span>
            <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
              Next
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <SkeletonBox className="h-64 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Record</TableHead>
                  <TableHead>Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.rows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No changes recorded.
                    </TableCell>
                  </TableRow>
                )}
                {(data?.rows ?? []).map((row) => (
                  <Fragment key={row.id}>
                    <TableRow
                      className="cursor-pointer"
                      aria-expanded={open === row.id}
                      onClick={() => setOpen(open === row.id ? null : row.id)}
                    >
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {format(new Date(row.performedAt), "dd MMM yyyy HH:mm")}
                      </TableCell>
                      <TableCell>{row.performedByName ?? "—"}</TableCell>
                      <TableCell>
                        {entityLabel(row.entity)}
                        {row.entityId != null && <span className="font-mono text-muted-foreground"> #{row.entityId}</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant={actionVariant(row.action)}>{row.action}</Badge>
                      </TableCell>
                    </TableRow>
                    {open === row.id && (
                      <TableRow className="bg-muted/30 hover:bg-muted/30">
                        <TableCell colSpan={4}>
                          <div className="max-h-80 overflow-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="p-1 text-left font-medium">Field</th>
                                  <th className="p-1 text-left font-medium">Before</th>
                                  <th className="p-1 text-left font-medium">After</th>
                                </tr>
                              </thead>
                              <tbody className="font-mono">
                                {changedFields(row).map((f) => (
                                  <tr key={f.key} className="border-t align-top">
                                    <td className="p-1 font-sans font-medium">{f.key}</td>
                                    <td className="break-all p-1 text-destructive">{show(f.before)}</td>
                                    <td className="break-all p-1 text-emerald-600">{show(f.after)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </Fragment>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
