import { useMemo, useState } from "react";
import { useLocation, useParams } from "wouter";
import { ArrowLeft, AlertTriangle, Truck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/hooks/use-toast";
import { useGatePass, useCompleteGatePass, useCancelGatePass } from "@/hooks/use-gate-passes";
import { useAuthStore } from "@/stores/auth.store";
import { Roles, can } from "@/lib/roles";
import type { GatePassDirection, GatePassStatus } from "@/types/schema";
import { format } from "date-fns";

function errorMessage(error: unknown): string {
  if (!error) return "Something went wrong";
  if (typeof error === "string") return error;
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong";
}

function statusVariant(status: GatePassStatus) {
  if (status === "COMPLETED") return "default" as const;
  if (status === "CANCELLED") return "destructive" as const;
  return "secondary" as const;
}

/** Integer grams to a fixed 2-decimal kg string for display. */
function fmtGrams(grams: number | null | undefined): string {
  if (grams == null) return "-";
  return (grams / 1000).toLocaleString("en-PK", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDateTime(value: string | null | undefined): string {
  if (!value) return "-";
  return format(new Date(value), "dd MMM yyyy HH:mm");
}

export default function GatePassDetailPage() {
  const { t, language, isRTL } = useLanguage();
  const [, setLocation] = useLocation();
  const params = useParams<{ id?: string }>();
  const id = Number(params.id);
  const { toast } = useToast();
  const role = useAuthStore((state) => state.user?.role);

  const canComplete = can(role, Roles.ops);
  const canCancel = can(role, Roles.settings);

  const { data: pass, isLoading } = useGatePass(Number.isFinite(id) ? id : null);
  const completeMutation = useCompleteGatePass();
  const cancelMutation = useCancelGatePass();

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  // A weighbridge net that disagrees with the expected weight usually means a
  // typo on one of the two sides. The server compares it against the linked
  // purchase/sale; when there is no linked document we fall back to the summed
  // line weight. Either way, flag anything past half a percent so the munshi
  // can catch it before the document is completed.
  const netMismatch = useMemo(() => {
    if (!pass || pass.netG == null) return false;
    if (pass.weighbridgeWarning) return true;
    if (!pass.totalWeightG) return false;
    const diff = Math.abs(pass.netG - pass.totalWeightG);
    return diff / pass.totalWeightG > 0.005;
  }, [pass]);

  const handleComplete = () => {
    if (!pass) return;
    completeMutation.mutate(pass.id, {
      onSuccess: () => toast({ title: t("gatePassCompleted") }),
      onError: (err) =>
        toast({ title: t("saveFailed"), description: errorMessage(err), variant: "destructive" }),
    });
  };

  const handleCancel = () => {
    if (!pass) return;
    if (!reason.trim()) {
      toast({
        title: t("cancellationReason"),
        description:
          language === "ur" ? "منسوخی کی وجہ لکھیں۔" : "Enter a reason for cancelling this pass.",
        variant: "destructive",
      });
      return;
    }
    cancelMutation.mutate(
      { id: pass.id, reason: reason.trim() },
      {
        onSuccess: () => {
          toast({ title: t("gatePassCancelled") });
          setCancelOpen(false);
          setReason("");
        },
        onError: (err) =>
          toast({ title: t("saveFailed"), description: errorMessage(err), variant: "destructive" }),
      },
    );
  };

  if (!isLoading && !pass) {
    return (
      <div className="p-6 space-y-4">
        <Button variant="ghost" onClick={() => setLocation("/gate-passes")}>
          <ArrowLeft className="h-4 w-4" />
          {t("gatePasses")}
        </Button>
        <p className="text-sm text-muted-foreground">
          {language === "ur" ? "گیٹ پاس نہیں ملا۔" : "Gate pass not found."}
        </p>
      </div>
    );
  }

  const statusLabel = (status: GatePassStatus | undefined) =>
    status === "ISSUED" ? t("issued") : status === "COMPLETED" ? t("completed") : t("cancelled");

  const directionLabel = (direction: GatePassDirection | undefined) =>
    direction === "IN" ? t("directionIn") : t("directionOut");

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={`flex items-start justify-between gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/gate-passes")}
            aria-label={t("gatePasses")}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className={isRTL ? "text-right" : ""}>
            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
              <h1 className="text-2xl font-semibold font-mono">{pass?.number ?? "—"}</h1>
              {pass && <Badge variant={statusVariant(pass.status)}>{statusLabel(pass.status)}</Badge>}
              {pass && <Badge variant="outline">{directionLabel(pass.direction)}</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">{t("gatePass")}</p>
          </div>
        </div>

        {pass && (
          <div className={`flex flex-wrap items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <PrintActions
              docKey={docKeys.gatePass}
              params={{ gatePassId: pass.id, language }}
              title={t("gatePass")}
            />
            {canComplete && pass.status === "ISSUED" && (
              <Button
                onClick={handleComplete}
                disabled={completeMutation.isPending}
                data-testid="button-complete"
              >
                {completeMutation.isPending ? t("loading") : t("markCompleted")}
              </Button>
            )}
            {canCancel && pass.status !== "CANCELLED" && (
              <Button
                variant="destructive"
                onClick={() => setCancelOpen(true)}
                data-testid="button-cancel-pass"
              >
                {t("cancelGatePass")}
              </Button>
            )}
          </div>
        )}
      </div>

      {pass && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("gatePass")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <Row label={t("direction")} value={directionLabel(pass.direction)} />
                <Row label={t("vehicleNumber")} value={pass.vehicleNo || "-"} mono />
                <Row label={t("driverName")} value={pass.driverName || "-"} />
                <Row label={t("driverPhone")} value={pass.driverPhone || "-"} mono />
                <Row label={t("party")} value={pass.partyName || "-"} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("linkedDocument")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {pass.linkedDocument ? (
                  <>
                    <Row
                      label={t("source")}
                      value={`${pass.linkedDocument.label} · ${pass.linkedDocument.number}`}
                      mono
                    />
                    <Row label={t("date")} value={fmtDateTime(pass.linkedDocument.date)} />
                  </>
                ) : (
                  <p className="text-muted-foreground">
                    {language === "ur" ? "کوئی منسلک دستاویز نہیں" : "No linked document"}
                  </p>
                )}
                <Row label={t("issued")} value={fmtDateTime(pass.issuedAt)} />
                {pass.completedAt && (
                  <Row label={t("completed")} value={fmtDateTime(pass.completedAt)} />
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("items")}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className={`py-2 font-medium ${isRTL ? "text-right" : "text-left"}`}>
                        {t("product")}
                      </th>
                      <th className="py-2 text-right font-medium">{t("bags")}</th>
                      <th className="py-2 text-right font-medium">{t("weightKg")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(pass.items ?? []).map((item) => (
                      <tr key={item.id} className="border-b last:border-0">
                        <td className="py-2">
                          {item.productName || "-"}
                          {item.productNameUrdu ? (
                            <span className="text-muted-foreground"> ({item.productNameUrdu})</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right font-mono">{item.bags}</td>
                        <td className="py-2 text-right font-mono">{fmtGrams(item.weightG)}</td>
                      </tr>
                    ))}
                    {(pass.items ?? []).length === 0 && (
                      <tr>
                        <td colSpan={3} className="py-3 text-center text-muted-foreground">
                          {language === "ur" ? "کوئی آئٹم نہیں" : "No items"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="font-medium">
                      <td className="py-2">{t("total")}</td>
                      <td className="py-2 text-right font-mono">{pass.totalBags ?? 0}</td>
                      <td className="py-2 text-right font-mono">{fmtGrams(pass.totalWeightG)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-2">
              <CardTitle className="text-base">{t("weighbridge")}</CardTitle>
              <Truck className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              <Row label={t("grossWeight")} value={fmtGrams(pass.grossG)} mono />
              <Row label={t("tareWeight")} value={fmtGrams(pass.tareG)} mono />
              <Row label={t("netWeight")} value={fmtGrams(pass.netG)} mono />
              {netMismatch && (
                <div className="md:col-span-3 flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-400">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    {language === "ur"
                      ? "کانٹے کا خالص وزن درج شدہ وزن سے 0.5% سے زیادہ مختلف ہے۔"
                      : "Weighbridge net differs from the recorded weight by more than 0.5%."}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("timeline")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <TimelineRow
                title={t("issued")}
                date={fmtDateTime(pass.issuedAt)}
                variant="secondary"
              />
              {pass.completedAt && (
                <TimelineRow
                  title={t("completed")}
                  date={fmtDateTime(pass.completedAt)}
                  variant="default"
                />
              )}
              {pass.status === "CANCELLED" && (
                <TimelineRow
                  title={t("cancelled")}
                  date={fmtDateTime(pass.cancelledAt)}
                  variant="destructive"
                  note={pass.cancelledReason || undefined}
                />
              )}
            </CardContent>
          </Card>

          {pass.remarks && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("remarks")}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm whitespace-pre-wrap">{pass.remarks}</p>
              </CardContent>
            </Card>
          )}
        </>
      )}

      <Dialog
        open={cancelOpen}
        onOpenChange={(open) => {
          setCancelOpen(open);
          if (!open) setReason("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("cancelGatePass")}</DialogTitle>
            <DialogDescription>
              {language === "ur"
                ? "منسوخی سے پاس ختم نہیں ہوتا، صرف منسوخ ہوتا ہے اور آڈٹ لاگ میں درج ہوتا ہے۔"
                : "Cancelling never deletes the pass; it is marked cancelled and written to the audit log."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">{t("cancellationReason")}</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-cancel-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelMutation.isPending || !reason.trim()}
              data-testid="button-confirm-cancel"
            >
              {cancelMutation.isPending ? t("loading") : t("cancelGatePass")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={mono ? "font-mono" : ""}>{value}</span>
    </div>
  );
}

function TimelineRow({
  title,
  date,
  variant,
  note,
}: {
  title: string;
  date: string;
  variant: "default" | "secondary" | "destructive";
  note?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <Badge variant={variant} className="mt-0.5">
        {title}
      </Badge>
      <div className="space-y-1">
        <p className="font-mono">{date}</p>
        {note && <p className="text-muted-foreground">{note}</p>}
      </div>
    </div>
  );
}
