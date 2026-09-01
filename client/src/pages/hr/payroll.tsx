import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, CircleDollarSign, Eye, Pencil, RefreshCw, Trash2 } from "lucide-react";

import type { Account, Employee, Payroll } from "@/types/schema";
import { useLanguage } from "@/contexts/language-context";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DataTable, type Column } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth.store";

type PayrollWithEmployee = Payroll & { employee: Employee | null };
type PayrollAuditRow = {
  id: number;
  action: string;
  performedByRole: string | null;
  performedAt: Date | string;
  detailsJson: string | null;
};

const paymentSchema = z.object({
  method: z.enum(["Cash", "Bank"]).default("Cash"),
  paymentAccountId: z.string().optional(),
  paymentDate: z.string().optional(),
});
type PaymentFormData = z.infer<typeof paymentSchema>;

const editSchema = z.object({
  basicSalary: z.string().min(1, "Basic salary is required"),
  allowances: z.string().min(1, "Allowances are required"),
  deductions: z.string().min(1, "Deductions are required"),
});
type EditFormData = z.infer<typeof editSchema>;

export default function PayrollPage() {
  const { isRTL } = useLanguage();
  const { toast } = useToast();
  const role = useAuthStore((state) => state.user?.role || "operator");

  const canGenerate = ["admin", "manager", "hr", "accountant"].includes(role);
  const canApprove = ["admin", "manager"].includes(role);
  const canPay = ["admin", "accountant"].includes(role);
  const canManageRegister = ["admin", "manager", "hr", "accountant"].includes(role);

  const [month, setMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [payrollToPay, setPayrollToPay] = useState<PayrollWithEmployee | null>(null);
  const [selectedPayroll, setSelectedPayroll] = useState<PayrollWithEmployee | null>(null);

  const paymentForm = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      method: "Cash",
      paymentAccountId: "",
      paymentDate: new Date().toISOString().slice(0, 10),
    },
  });

  const editForm = useForm<EditFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: { basicSalary: "0", allowances: "0", deductions: "0" },
  });

  const { data: payrolls = [], isLoading } = useQuery<PayrollWithEmployee[]>({
    queryKey: [`/api/payrolls?month=${month}`],
    enabled: !!month,
  });

  const { data: bankAccounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts?type=bank"],
  });

  const { data: payrollAudit = [] } = useQuery<PayrollAuditRow[]>({
    queryKey: [selectedPayroll ? `/api/payrolls/${selectedPayroll.id}/audit` : "/api/payrolls/0/audit"],
    enabled: !!selectedPayroll && (viewDialogOpen || editDialogOpen),
  });

  const generateMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/payrolls/generate", { payrollMonth: month }),
    onSuccess: async (res) => {
      await queryClient.invalidateQueries({ queryKey: [`/api/payrolls?month=${month}`] });
      const body = await res.json().catch(() => null);
      const created = Number(body?.created ?? 0);
      const updated = Number(body?.updated ?? 0);
      const skippedNoStructure = Number(body?.skippedNoStructure ?? 0);
      const skippedZeroNet = Number(body?.skippedZeroNet ?? 0);
      const skipped = Number(body?.skipped ?? 0);
      const cleaned = Number(body?.cleanedStaleGenerated ?? 0);
      toast({
        title: "Payroll generated",
        description: `Created: ${created}, Updated: ${updated}, Cleaned stale: ${cleaned}, Existing skipped: ${skipped}, No salary structure: ${skippedNoStructure}, Zero net: ${skippedZeroNet}`,
      });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed", variant: "destructive" }),
  });

  const approveMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("POST", `/api/payrolls/${id}/approve`, { postingDate: new Date().toISOString() }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/payrolls?month=${month}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/ledger"] }),
      ]);
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
            ? parseInt(payload.data.paymentAccountId, 10)
            : undefined,
        paymentDate: payload.data.paymentDate || undefined,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/payrolls?month=${month}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/cash/payments"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/cash/summary"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/cash/ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/ledger"] }),
      ]);
      setPayDialogOpen(false);
      setPayrollToPay(null);
      toast({ title: "Salary paid (JV posted)" });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: { id: number; data: EditFormData }) =>
      apiRequest("PATCH", `/api/payrolls/${payload.id}`, {
        basicSalary: payload.data.basicSalary,
        allowances: payload.data.allowances,
        deductions: payload.data.deductions,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/payrolls?month=${month}`] }),
        queryClient.invalidateQueries({
          predicate: (q) => typeof q.queryKey[0] === "string" && (q.queryKey[0] as string).startsWith("/api/reports/salary-account"),
        }),
      ]);
      setEditDialogOpen(false);
      setSelectedPayroll(null);
      toast({ title: "Payroll updated" });
    },
    onError: (err: any) => toast({ title: "Error", description: err?.message || "Failed to update payroll", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/payrolls/${id}`),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [`/api/payrolls?month=${month}`] }),
        queryClient.invalidateQueries({ queryKey: ["/api/journal-vouchers"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/ledger"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/cash/payments"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/cash/summary"] }),
        queryClient.invalidateQueries({ queryKey: ["/api/cash/ledger"] }),
      ]);
      toast({ title: "Payroll deleted" });
    },
    onError: (err: any) => toast({ title: "Delete failed", description: err?.message || "Failed to delete payroll", variant: "destructive" }),
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
            <Badge
              variant={(p.paymentStatus || "").toLowerCase() === "paid" || p.status === "paid" ? "default" : "secondary"}
            >
              {p.paymentStatus || (p.status === "paid" ? "Paid" : "Unpaid")}
            </Badge>
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
            <Button
              size="icon"
              variant="ghost"
              onClick={() => {
                setSelectedPayroll(p);
                setViewDialogOpen(true);
              }}
              title="View payroll"
            >
              <Eye className="h-4 w-4" />
            </Button>
            {canManageRegister && (
              <Button
                size="icon"
                variant="ghost"
                disabled={!(p.status === "generated" || p.status === "approved")}
                title={
                  p.status === "generated" || p.status === "approved"
                    ? "Edit payroll"
                    : "Paid payroll cannot be edited"
                }
                onClick={() => {
                  setSelectedPayroll(p);
                  editForm.reset({
                    basicSalary: String(p.basicSalary || "0"),
                    allowances: String(p.allowances || "0"),
                    deductions: String(p.deductions || "0"),
                  });
                  setEditDialogOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </Button>
            )}
            {canManageRegister && (
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                disabled={deleteMutation.isPending}
                onClick={() => {
                  const ok = window.confirm("Delete this payroll? Linked payroll journal vouchers will also be removed.");
                  if (!ok) return;
                  deleteMutation.mutate(p.id);
                }}
                title="Delete payroll"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
            {canApprove && p.status === "generated" && parseFloat(p.netSalary || "0") > 0 && (
              <Button size="sm" onClick={() => approveMutation.mutate(p.id)} disabled={approveMutation.isPending}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Approve
              </Button>
            )}
            {p.status === "generated" && parseFloat(p.netSalary || "0") <= 0 && (
              <Badge variant="secondary">No salary structure / zero net</Badge>
            )}
            {canPay && p.status === "approved" && (
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
    [
      isRTL,
      canApprove,
      canPay,
      canManageRegister,
      approveMutation,
      deleteMutation,
      paymentForm,
      editForm,
    ],
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
            Generate - Approve (posts Salary Expense + Payable) - Pay (posts Payable - Cash/Bank)
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
                    Pay and Post JV
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={viewDialogOpen}
        onOpenChange={(open) => {
          setViewDialogOpen(open);
          if (!open) setSelectedPayroll(null);
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Payroll Details</DialogTitle>
          </DialogHeader>
          {selectedPayroll && (
            <div className="space-y-4 text-sm">
              <div className="grid grid-cols-2 gap-3 rounded-md border p-3">
                <div>
                  <div className="text-muted-foreground">Month</div>
                  <div className="font-mono">{selectedPayroll.payrollMonth}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Employee</div>
                  <div>{selectedPayroll.employee?.name || "-"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Basic Salary</div>
                  <div className="font-mono">{selectedPayroll.basicSalary}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Allowances</div>
                  <div className="font-mono">{selectedPayroll.allowances}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Deductions</div>
                  <div className="font-mono">{selectedPayroll.deductions}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Net Salary</div>
                  <div className="font-mono">{selectedPayroll.netSalary}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Status</div>
                  <div>{selectedPayroll.status}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Payment Status</div>
                  <div>{selectedPayroll.paymentStatus || "-"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Accrual JV</div>
                  <div>{selectedPayroll.journalVoucherId || "-"}</div>
                </div>
                <div>
                  <div className="text-muted-foreground">Payment JV</div>
                  <div>{selectedPayroll.paymentJournalVoucherId || "-"}</div>
                </div>
              </div>
              <div className="rounded-md border p-3">
                <div className="mb-2 font-medium">Audit Trail</div>
                {payrollAudit.length === 0 ? (
                  <div className="text-muted-foreground">No audit entries.</div>
                ) : (
                  <div className="space-y-2">
                    {payrollAudit.slice(0, 8).map((a) => (
                      <div key={a.id} className="flex items-center justify-between border-b pb-1 text-xs">
                        <span className="uppercase">{a.action}</span>
                        <span className="text-muted-foreground">{new Date(a.performedAt as any).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editDialogOpen}
        onOpenChange={(open) => {
          setEditDialogOpen(open);
          if (!open) setSelectedPayroll(null);
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Payroll</DialogTitle>
          </DialogHeader>
          {selectedPayroll && (
            <Form {...editForm}>
              <form
                onSubmit={editForm.handleSubmit((data) => updateMutation.mutate({ id: selectedPayroll.id, data }))}
                className="space-y-4"
              >
                <div className="rounded-md border p-3 text-sm">
                  <div className="flex justify-between">
                    <span>Month</span>
                    <span className="font-mono">{selectedPayroll.payrollMonth}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Employee</span>
                    <span>{selectedPayroll.employee?.name || "-"}</span>
                  </div>
                </div>
                <FormField
                  control={editForm.control}
                  name="basicSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Basic Salary</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="allowances"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Allowances</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={editForm.control}
                  name="deductions"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Deductions</FormLabel>
                      <FormControl>
                        <Input type="number" step="0.01" min="0" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <Separator />
                <div className={`flex justify-end gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <Button type="button" variant="outline" onClick={() => setEditDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updateMutation.isPending}>
                    Save
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
