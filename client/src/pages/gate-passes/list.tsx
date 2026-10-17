import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Plus, Truck, LogOut, ClipboardList } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DataTable, type Column } from "@/components/data-table";
import { useLanguage } from "@/contexts/language-context";
import { useGatePasses, useGatePassDashboard } from "@/hooks/use-gate-passes";
import type { GatePassListRow, GatePassStatus } from "@/types/schema";
import { format } from "date-fns";

function fmtWeight(grams: number | null | undefined): string {
  if (grams == null) return "-";
  return (grams / 1000).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function statusVariant(status: GatePassStatus) {
  if (status === "COMPLETED") return "default" as const;
  if (status === "CANCELLED") return "destructive" as const;
  return "secondary" as const;
}

type Tab = "ALL" | "IN" | "OUT" | "OPEN";

export default function GatePassesListPage() {
  const { t, language, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const [tab, setTab] = useState<Tab>(() => {
    const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
    const value = (params.get("tab") || "").toUpperCase();
    return (["ALL", "IN", "OUT", "OPEN"].includes(value) ? value : "ALL") as Tab;
  });
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [vehicleNo, setVehicleNo] = useState("");

  const filters = useMemo(() => {
    const f: {
      from?: string;
      to?: string;
      direction?: "IN" | "OUT";
      status?: GatePassStatus;
      vehicleNo?: string;
    } = {};
    if (from) f.from = from;
    if (to) f.to = to;
    if (vehicleNo.trim()) f.vehicleNo = vehicleNo.trim();
    if (tab === "IN") f.direction = "IN";
    if (tab === "OUT") f.direction = "OUT";
    if (tab === "OPEN") f.status = "ISSUED";
    return f;
  }, [tab, from, to, vehicleNo]);

  const { data: passes = [], isLoading } = useGatePasses(filters);
  const { data: dashboard } = useGatePassDashboard();

  const columns: Column<GatePassListRow>[] = [
    {
      key: "number",
      title: t("gatePassNumber"),
      render: (row) => <span className="font-mono">{row.number}</span>,
    },
    {
      key: "direction",
      title: t("direction"),
      render: (row) => (
        <Badge variant="outline">
          {row.direction === "IN" ? t("directionIn") : t("directionOut")}
        </Badge>
      ),
    },
    {
      key: "status",
      title: t("status"),
      render: (row) => (
        <Badge variant={statusVariant(row.status)}>
          {row.status === "ISSUED"
            ? t("issued")
            : row.status === "COMPLETED"
              ? t("completed")
              : t("cancelled")}
        </Badge>
      ),
    },
    { key: "vehicleNo", title: t("vehicleNumber"), render: (row) => row.vehicleNo || "-" },
    { key: "partyName", title: t("party"), render: (row) => row.partyName || "-" },
    {
      key: "totalBags",
      title: t("bags"),
      align: "right",
      render: (row) => <span className="font-mono">{row.totalBags}</span>,
    },
    {
      key: "netG",
      title: `${t("netWeight")}`,
      align: "right",
      render: (row) => <span className="font-mono">{fmtWeight(row.totalWeightG)}</span>,
    },
    {
      key: "issuedAt",
      title: t("date"),
      render: (row) => (
        <span className="font-mono">
          {row.issuedAt ? format(new Date(row.issuedAt), "dd MMM yyyy HH:mm") : "-"}
        </span>
      ),
    },
  ];

  const tabs: Tab[] = ["ALL", "IN", "OUT", "OPEN"];

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-center justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={isRTL ? "text-right" : ""}>
          <h1 className="text-2xl font-semibold">{t("gatePasses")}</h1>
          <p className="text-sm text-muted-foreground">
            {language === "ur"
              ? "گاڑیوں کی آمد و روانگی کا ریکارڈ"
              : "Track vehicle arrivals and dispatches"}
          </p>
        </div>
        <Button
          onClick={() => setLocation("/gate-passes/new")}
          data-testid="button-add-gate-pass"
        >
          <Plus className="h-4 w-4" />
          {t("newGatePass")}
        </Button>
      </div>

      <div className={`grid gap-4 md:grid-cols-3 ${isRTL ? "flex-row-reverse" : ""}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("vehiclesInsideToday")}
            </CardTitle>
            <Truck className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {dashboard?.vehiclesInside ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("dispatchedTodayBags")}
            </CardTitle>
            <LogOut className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {dashboard?.dispatchedBagsToday ?? 0}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {t("openPasses")}
            </CardTitle>
            <ClipboardList className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold font-mono ${isRTL ? "text-right" : ""}`}>
              {dashboard?.openPasses ?? 0}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <div className={`flex flex-wrap items-end gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className="flex border rounded-md overflow-hidden">
              {tabs.map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  variant={tab === value ? "default" : "ghost"}
                  onClick={() => setTab(value)}
                  data-testid={`tab-${value.toLowerCase()}`}
                >
                  {value === "ALL"
                    ? t("all")
                    : value === "IN"
                      ? t("directionIn")
                      : value === "OUT"
                        ? t("directionOut")
                        : t("openPasses")}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t("dateRange")}</Label>
              <Input
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="h-9 w-36"
                data-testid="filter-from"
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="h-9 w-36"
                data-testid="filter-to"
              />
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t("vehicleNumber")}</Label>
              <Input
                value={vehicleNo}
                onChange={(e) => setVehicleNo(e.target.value)}
                placeholder="ABC-1234"
                className="h-9 w-40"
                data-testid="filter-vehicle"
              />
            </div>
          </div>

          <DataTable
            columns={columns}
            data={passes}
            isLoading={isLoading}
            onRowClick={(row) => setLocation(`/gate-passes/${row.id}`)}
            testIdPrefix="gate-passes"
          />
        </CardContent>
      </Card>
    </div>
  );
}
