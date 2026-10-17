import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/data-table";

type AgingRow = {
  outstandingAmount: string;
  daysOutstanding: number;
  bucket0To30: string;
  bucket31To60: string;
  bucket61To90: string;
  bucket91Plus: string;
};

type PartyTotals = {
  partyId: number;
  partyName: string;
  invoices: number;
  oldestDays: number;
  outstanding: number;
  b0: number;
  b31: number;
  b61: number;
  b91: number;
};

const rs = (n: number) => <span className="font-mono">Rs. {n.toLocaleString()}</span>;

/**
 * One row per party, summed from the per-invoice aging rows, biggest balance first.
 * Who to chase is a per-party question; the invoice list below answers "for what".
 */
export function PartyAgingTable<T extends AgingRow>({
  rows,
  partyId,
  partyName,
  title,
  isLoading,
  onSelect,
}: {
  rows: T[];
  partyId: (row: T) => number;
  partyName: (row: T) => string;
  title: string;
  isLoading: boolean;
  onSelect: (partyId: number) => void;
}) {
  const parties = useMemo(() => {
    const byParty = new Map<number, PartyTotals>();
    for (const r of rows) {
      const id = partyId(r);
      const p = byParty.get(id) ?? {
        partyId: id,
        partyName: partyName(r),
        invoices: 0,
        oldestDays: 0,
        outstanding: 0,
        b0: 0,
        b31: 0,
        b61: 0,
        b91: 0,
      };
      p.invoices += 1;
      p.oldestDays = Math.max(p.oldestDays, r.daysOutstanding);
      p.outstanding += Number(r.outstandingAmount || 0);
      p.b0 += Number(r.bucket0To30 || 0);
      p.b31 += Number(r.bucket31To60 || 0);
      p.b61 += Number(r.bucket61To90 || 0);
      p.b91 += Number(r.bucket91Plus || 0);
      byParty.set(id, p);
    }
    return [...byParty.values()].sort((a, b) => b.outstanding - a.outstanding);
  }, [rows, partyId, partyName]);

  const columns: Column<PartyTotals>[] = useMemo(
    () => [
      { key: "partyName", title: "Party" },
      { key: "invoices", title: "Invoices", align: "right" },
      { key: "oldestDays", title: "Oldest (days)", align: "right" },
      {
        key: "outstanding",
        title: "Outstanding",
        align: "right",
        render: (p) => <span className="font-mono font-semibold text-destructive">Rs. {p.outstanding.toLocaleString()}</span>,
      },
      { key: "b0", title: "0-30", align: "right", render: (p) => rs(p.b0) },
      { key: "b31", title: "31-60", align: "right", render: (p) => rs(p.b31) },
      { key: "b61", title: "61-90", align: "right", render: (p) => rs(p.b61) },
      { key: "b91", title: "91+", align: "right", render: (p) => rs(p.b91) },
    ],
    [],
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={parties}
          isLoading={isLoading}
          searchable
          emptyMessage="Nothing outstanding"
          onRowClick={(p) => onSelect(p.partyId)}
        />
      </CardContent>
    </Card>
  );
}
