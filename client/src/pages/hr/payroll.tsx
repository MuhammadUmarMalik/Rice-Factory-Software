import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, CircleDollarSign, RefreshCw } from "lucide-react";

import type { Account, Employee, Payroll } from "@shared/schema";
import { useLanguage } from "@/contexts/language-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DataTable, type Column } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth.store";

type PayrollWithEmployee = Payroll & { employee: Employee | null };

const paymentSchema = z.object({
  method: z.enum(["Cash", "Bank"]).default("Cash"),
  paymentAccountId: z.string().optional(),
  paymentDate: z.string().optional(),
});
type PaymentFormData = z.infer<typeof paymentSchema>;

export default function PayrollPage() {
  const { isRTL } = useLanguage();
  const { toast } = useToast();
  const role = useAuthStore((state) => state.user?.role || "operator");

  const canGenerate = ["admin", "manager", "hr", "accountant"].includes(role);
  const canApprove = ["admin", "manager"].includes(role);
  const canPay = ["admin", "accountant"].includes(role);

  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payrollToPay, setPayrollToPay] = useState<PayrollWithEmployee | null>(null);

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      method: "Cash",
      paymentAccountId: "",
      paymentDate: new Date().toISOString().slice(0, 10),
    },
  });

  const { data: payrolls = [], isLoading } = useQuery<PayrollWithEmployee[]>({
    queryKey: [`/api/payrolls?month=${month}`],
    enabled: !!month,
  });

  const { data: bankAccounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=bank"],
  });

  const generateMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/payrolls/generate", { payrollMonth: month }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/payrolls?month=${month}`] });
      toast({ title: "Payroll generated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed", variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/payrolls/${id}/approve`, { postingDate: new Date().toISOString() }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/payrolls?month=${month}`] });
      toast({ title: "Payroll approved (JV posted)" });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed", variant: "destructive" }),
  });

  const payMutation = useMutation({
    mutationFn: async (payload: { id: number; data: PaymentFormData }) =>
      apiRequest("POST", `/api/payrolls/${payload.id}/pay`, {
        method: payload.data.method,
        paymentAccountId:
          payload.data.method === "Bank" && payload.data.paymentAccountId
            ? parseInt(payload.data.paymentAccountId)
            : undefined,
        paymentDate: payload.data.paymentDate || undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: [`/api/payrolls?month=${month}`] });
      setPayDialogOpen(false);
      setPayrollToPay(null);
      toast({ title: "Salary paid (JV posted)" });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed", variant: "destructive" }),
  });

  const columns: Column<PayrollWithEmployee>[] = useMemo(
    () => [
      { key: "payrollMonth", title: "Month", render: (p) => <span className="font-mono">{p.payrollMonth}</span> },
      {
        key: "employee",
        title: "Employee",
        render: (p) => (
          <div className="min-w-0">
            <div className="font-medium truncate">{p.employee?.name || "Employee"}</div>
            <div className="text-xs text-muted-foreground font-mono">{p.employee?.employeeCode || ""}</div>
          </div>
        ),
      },
      { key: "netSalary", title: "Net", render: (p) => <span className="font-mono">{p.netSalary}</span> },
      {
        key: "status",
        title: "Status",
        render: (p) => (
          <div className="flex gap-2">
            <Badge variant={p.status === "generated" ? "secondary" : "default"}>{p.status}</Badge>
            <Badge variant={p.paymentStatus === "Paid" ? "default" : "secondary"}>{p.paymentStatus}</Badge>
          </div>
        ),
      },
      {
        key: "jv",
        title: "JV",
        render: (p) => (
          <div className="text-xs text-muted-foreground">
            <div>Accrual: {p.journalVoucherId || "-"}</div>
            <div>Payment: {p.paymentJournalVoucherId || "-"}</div>
          </div>
        ),
      },
      {
        key: "actions",
        title: "",
        render: (p) => (
          <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            {canApprove && p.status === "generated" && (
              <Button size="sm" onClick={() => approveMutation.mutate(p.id)} disabled={approveMutation.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
            )}
            {canPay && p.status === "approved" && p.paymentStatus === "Unpaid" && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setPayrollToPay(p);
                  paymentForm.reset({
                    method: "Cash",
                    paymentAccountId: "",
                    paymentDate: new Date().toISOString().slice(0, 10),
                  });
                  setPayDialogOpen(true);
                }}
              >
                <CircleDollarSign className="h-4 w-4 mr-2" />
                Pay
              </Button>
            )}
          </div>
        ),
      },
    ],
    [isRTL, canApprove, canPay, approveMutation, paymentForm],
  );

  const generatedCount = payrolls.filter((p) => p.status === "generated").length;
  const approvedCount = payrolls.filter((p) => p.status === "approved").length;
  const paidCount = payrolls.filter((p) => p.status === "paid").length;

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "text-right" : ""}`}>
      <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div>
          <h1 className="text-2xl font-semibold">Payroll</h1>
          <p className="text-sm text-muted-foreground">
            Generate → Approve (posts Salary Expense + Payable) → Pay (posts Payable → Cash/Bank)
          </p>
        </div>
        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-[160px]" />
          {canGenerate && (
            <Button onClick={() => generateMutation.mutate()} disabled={generateMutation.isPending || !month}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Generate
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Generated</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{generatedCount}</div>
            <div className="text-xs text-muted-foreground">Awaiting approval</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Approved</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{approvedCount}</div>
            <div className="text-xs text-muted-foreground">Salary expense posted, payable outstanding</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{paidCount}</div>
            <div className="text-xs text-muted-foreground">Payable settled via cash/bank</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll Register</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={payrolls} isLoading={isLoading} />
        </CardContent>
      </Card>

      <Dialog
        open={payDialogOpen}
        onOpenChange={(open) => {
          setPayDialogOpen(open);
          if (!open) setPayrollToPay(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              Pay Salary {payrollToPay?.employee ? `- ${payrollToPay.employee.name}` : ""}
            </DialogTitle>
          </DialogHeader>
          {payrollToPay && (
            <Form {...paymentForm}>
              <form
                onSubmit={paymentForm.handleSubmit((data) => payMutation.mutate({ id: payrollToPay.id, data }))}
                className="space-y-4"
              >
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex justify-between">
                    <span>Month</span>
                    <span className="font-mono">{payrollToPay.payrollMonth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Net</span>
                    <span className="font-mono">{payrollToPay.netSalary}</span>
                  </div>
                </div>

                <FormField
                  control={paymentForm.control}
                  name="paymentDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={paymentForm.control}
                  name="method"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Payment Method</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Cash">Cash</SelectItem>
                          <SelectItem value="Bank">Bank</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />

                {paymentForm.watch("method") === "Bank" && (
                  <FormField
                    control={paymentForm.control}
                    name="paymentAccountId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Bank Account</FormLabel>
                        <Select value={field.value || ""} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select bank" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {bankAccounts.map((b) => (
                              <SelectItem key={b.id} value={String(b.id)}>
                                {b.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </FormItem>
                    )}
                  />
                )}

                <Separator />
                <div className={`flex justify-end gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <Button type="button" variant="outline" onClick={() => setPayDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={payMutation.isPending}>
                    Pay & Post JV
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
