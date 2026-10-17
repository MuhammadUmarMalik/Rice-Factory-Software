import { useState } from "react";
import { Lock, Trash2 } from "lucide-react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/language-context";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { invalidateApi } from "@/api/invalidation";

type PeriodLock = {
  id: number;
  fromDate: string;
  toDate: string;
  reason: string | null;
  createdAt: string;
};

/** Last day of the previous month, the usual thing to lock up to. */
function lastMonthEnd() {
  const d = new Date();
  return format(new Date(d.getFullYear(), d.getMonth(), 0), "yyyy-MM-dd");
}

export function PeriodLocksCard() {
  const { language, isRTL } = useLanguage();
  const ur = language === "ur";
  const { toast } = useToast();
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState(lastMonthEnd);
  const [reason, setReason] = useState("");

  const { data: locks = [], isLoading } = useQuery<PeriodLock[]>({ queryKey: ["/api/period-locks"] });

  const onError = (error: unknown) =>
    toast({ title: ur ? "ناکام" : "Failed", description: (error as Error).message, variant: "destructive" });

  const createLock = useMutation({
    mutationFn: () => apiRequest("POST", "/api/period-locks", { fromDate, toDate, reason }),
    onSuccess: () => {
      invalidateApi(["/api/period-locks"]);
      setFromDate("");
      setReason("");
      toast({ title: ur ? "مدت لاک ہو گئی" : "Period locked" });
    },
    onError,
  });

  const deleteLock = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/period-locks/${id}`),
    onSuccess: () => {
      invalidateApi(["/api/period-locks"]);
      toast({ title: ur ? "لاک ختم ہو گیا" : "Lock removed" });
    },
    onError,
  });

  const day = (value: string) => format(new Date(value), "dd MMM yyyy");

  return (
    <Card>
      <CardHeader className={isRTL ? "text-right" : ""}>
        <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
          <Lock className="h-4 w-4" />
          {ur ? "مدت لاک" : "Period Locks"}
        </CardTitle>
        <CardDescription>
          {ur
            ? "لاک شدہ تاریخوں میں کوئی خریداری، فروخت یا واؤچر درج، تبدیل یا حذف نہیں ہو سکتا۔"
            : "No purchase, sale or voucher dated inside a locked range can be created, edited or deleted."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className={`grid gap-3 md:grid-cols-[1fr_1fr_2fr_auto] md:items-end ${isRTL ? "direction-rtl" : ""}`}
          onSubmit={(e) => {
            e.preventDefault();
            createLock.mutate();
          }}
        >
          <div className="space-y-1">
            <Label htmlFor="lock-from">{ur ? "سے" : "From"}</Label>
            <Input id="lock-from" type="date" required value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lock-to">{ur ? "تک" : "To"}</Label>
            <Input id="lock-to" type="date" required min={fromDate} value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lock-reason">{ur ? "وجہ" : "Reason"}</Label>
            <Input
              id="lock-reason"
              value={reason}
              placeholder={ur ? "مثلاً ستمبر کے کھاتے بند" : "e.g. September books closed"}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={createLock.isPending}>
            <Lock className="h-4 w-4" />
            {ur ? "لاک کریں" : "Lock"}
          </Button>
        </form>

        {isLoading ? null : locks.length === 0 ? (
          <p className="text-sm text-muted-foreground">{ur ? "کوئی مدت لاک نہیں۔" : "No periods are locked."}</p>
        ) : (
          <div className="divide-y rounded-md border">
            {locks.map((lock) => (
              <div key={lock.id} className={`flex items-center justify-between gap-3 p-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : ""}>
                  <p className="font-mono text-sm font-medium">
                    {day(lock.fromDate)} → {day(lock.toDate)}
                  </p>
                  {lock.reason && <p className="text-xs text-muted-foreground">{lock.reason}</p>}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={ur ? "لاک ختم کریں" : "Remove lock"}
                  disabled={deleteLock.isPending}
                  onClick={() => deleteLock.mutate(lock.id)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
