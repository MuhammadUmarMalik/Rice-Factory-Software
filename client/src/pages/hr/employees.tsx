import { useMemo, useState } from "react";
import { Plus, Edit, BadgeDollarSign, Trash2, BookOpen, Download, Search } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { format } from "date-fns";
import clsx from "clsx";
import type { Employee, EmployeeSalaryStructure, Account } from "@/types/schema";

import { useLanguage } from "@/contexts/language-context";
import { apiRequest } from "@/lib/queryClient";
import { fetchWithAuth } from "@/lib/authFetch";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";
import { useToast } from "@/hooks/use-toast";
import { todayLocal, toLocalDateString } from "@/utils/dateRanges";
import { useReportDateRange } from "@/hooks/useReportDateRange";
import { DataTable, type Column } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
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
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useAuthStore } from "@/stores/auth.store";
import { SkeletonBox } from "@/components/ui/skeletons";
import { DateRangeFilter } from "@/components/filters/DateRangeFilter";
import { PrintActions } from "@/components/print/PrintActions";
import { docKeys } from "@/print/docRegistry";
import { downloadCsv } from "@/lib/export";
import { confirmAction } from "@/components/confirm-dialog";

const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  fatherName: z.string().optional(),
  cnic: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  designation: z.string().optional(),
  department: z.string().optional(),
  joiningDate: z.string().optional(),
  employmentType: z.enum(["permanent", "contract"]).default("permanent"),
  basicSalary: z.string().default("0"),
  openingBalance: z.string().default("0"),
  openingBalanceType: z.enum(["debit", "credit"]).default("debit"),
  status: z.enum(["active", "inactive"]).default("active"),
});
type EmployeeFormData = z.infer<typeof employeeSchema>;

const salaryStructureSchema = z.object({
  effectiveFrom: z.string().min(1, "Effective from is required"),
  basicSalary: z.string().default("0"),
  allowances: z.string().default("0"),
  deductions: z.string().default("0"),
});
type SalaryStructureFormData = z.infer<typeof salaryStructureSchema>;

const khataEntrySchema = z.object({
  type: z.enum(["advance_given", "loan_issued", "deduction", "refund", "manual"]),
  amount: z.string().min(1, "Amount is required"),
  date: z.string().min(1, "Date is required"),
  note: z.string().optional(),
});
type KhataEntryFormData = z.infer<typeof khataEntrySchema>;

const KHATA_TYPES = [
  { value: "advance_given" as const, label: "Advance Given", dir: "dr" },
  { value: "loan_issued" as const, label: "Loan Issued", dir: "dr" },
  { value: "deduction" as const, label: "Deduction", dir: "cr" },
  { value: "refund" as const, label: "Refund / Adjustment", dir: "cr" },
  { value: "manual" as const, label: "Manual Entry", dir: "dr" },
] as const;

type LedgerRow = {
  id: number;
  entryDate: string | number | Date;
  narration: string;
  vchType: string;
  vchNo: string;
  debit: string;
  credit: string;
  runningBalance: string;
  cleared?: boolean;
};

type LedgerReport = {
  account: Account;
  openingBalance: string;
  openingBalanceType?: "debit" | "credit";
  rows: LedgerRow[];
  totals: { debit: string; credit: string; closingBalance: string };
};

export default function EmployeesPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const role = useAuthStore((state) => state.user?.role || "operator");
  const canEdit = ["admin", "manager", "hr"].includes(role);

  const [openEmployeeDialog, setOpenEmployeeDialog] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const [openSalaryDialog, setOpenSalaryDialog] = useState(false);
  const [salaryEmployee, setSalaryEmployee] = useState<Employee | null>(null);
  const [editingStructure, setEditingStructure] = useState<EmployeeSalaryStructure | null>(null);

  const [openKhataDialog, setOpenKhataDialog] = useState(false);
  const [khataEmployee, setKhataEmployee] = useState<Employee | null>(null);
  const [showAddEntry, setShowAddEntry] = useState(false);
  const [khataNarrationSearch, setKhataNarrationSearch] = useState("");
  const [khataSortAsc, setKhataSortAsc] = useState(true);
  const { range: khataRange, setRange: setKhataRange, fromDate: khataFrom, toDate: khataTo } = useReportDateRange({ preset: "all" });

  const showApiError = (error: unknown) => {
    const message = (error as any)?.message ? String((error as any).message) : "Unknown error";
    const lower = message.toLowerCase();
    if (lower.includes("no such table") || lower.includes("sqlite_error")) {
      toast({
        title: "Database not migrated",
        description: "Run `npm run db:push` and restart the dev server, then try again.",
        variant: "destructive",
      });
      return;
    }
    toast({ title: "Error", description: message, variant: "destructive" });
  };

  const employeeForm = useForm<EmployeeFormData>({
    resolver: zodResolver(employeeSchema),
    defaultValues: {
      name: "",
      fatherName: "",
      cnic: "",
      phone: "",
      email: "",
      designation: "",
      department: "",
      joiningDate: "",
      employmentType: "permanent",
      basicSalary: "0",
      openingBalance: "0",
      openingBalanceType: "debit",
      status: "active",
    },
  });

  const salaryForm = useForm<SalaryStructureFormData>({
    resolver: zodResolver(salaryStructureSchema),
    defaultValues: {
      effectiveFrom: todayLocal(),
      basicSalary: "0",
      allowances: "0",
      deductions: "0",
    },
  });

  const khataForm = useForm<KhataEntryFormData>({
    resolver: zodResolver(khataEntrySchema),
    defaultValues: {
      type: "advance_given",
      amount: "",
      date: todayLocal(),
      note: "",
    },
  });

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: accounts = [] } = useQuery<Account[]>({
    queryKey: ["/api/accounts"],
  });

  const cashAccount = useMemo(
    () => accounts.find((a) => a.isSystemAccount && a.name === "Cash in Hand"),
    [accounts],
  );

  const { data: khataLedger, isLoading: isKhataLoading } = useQuery<LedgerReport>({
    queryKey: ["/api/ledger", khataEmployee?.accountId, "employee", khataFrom, khataTo],
    enabled: !!khataEmployee?.accountId,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("accountId", String(khataEmployee!.accountId));
      params.set("scope", "employee");
      if (khataFrom) params.set("startDate", khataFrom);
      if (khataTo) params.set("endDate", khataTo);
      const res = await fetchWithAuth(`/api/ledger?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch khata");
      return res.json();
    },
  });

  const { data: salaryStructures = [], isLoading: isSalaryLoading } = useQuery<EmployeeSalaryStructure[]>({
    queryKey: salaryEmployee ? [`/api/employees/${salaryEmployee.id}/salary-structures`] : ["__skip__"],
    enabled: !!salaryEmployee,
  });

  const createEmployeeMutation = useMutation({
    mutationKey: ["/api/employees", "create"],
    meta: scopedInvalidation,
    mutationFn: (data: EmployeeFormData) =>
      apiRequest("POST", "/api/employees", {
        ...data,
        joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
      }),
    onSuccess: async () => {
      await invalidateApi(invalidationGroups.employees);
      setOpenEmployeeDialog(false);
      setEditingEmployee(null);
      employeeForm.reset();
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const updateEmployeeMutation = useMutation({
    mutationKey: ["/api/employees", "update"],
    meta: scopedInvalidation,
    mutationFn: (data: EmployeeFormData & { id: number }) =>
      apiRequest("PATCH", `/api/employees/${data.id}`, {
        ...data,
        joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
      }),
    onSuccess: async () => {
      await invalidateApi(invalidationGroups.employees);
      setOpenEmployeeDialog(false);
      setEditingEmployee(null);
      employeeForm.reset();
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const createStructureMutation = useMutation({
    mutationKey: ["/api/employees", "salary-structure", "create"],
    meta: scopedInvalidation,
    mutationFn: (data: SalaryStructureFormData & { employeeId: number }) =>
      apiRequest("POST", `/api/employees/${data.employeeId}/salary-structures`, {
        ...data,
        effectiveFrom: new Date(data.effectiveFrom),
      }),
    onSuccess: async () => {
      await invalidateApi(invalidationGroups.employees);
      salaryForm.reset({
        effectiveFrom: todayLocal(),
        basicSalary: "0",
        allowances: "0",
        deductions: "0",
      });
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const updateStructureMutation = useMutation({
    mutationKey: ["/api/employees", "salary-structure", "update"],
    meta: scopedInvalidation,
    mutationFn: (data: SalaryStructureFormData & { employeeId: number; id: number }) =>
      apiRequest("PATCH", `/api/employees/${data.employeeId}/salary-structures/${data.id}`, {
        ...data,
        effectiveFrom: new Date(data.effectiveFrom),
      }),
    onSuccess: async () => {
      await invalidateApi(invalidationGroups.employees);
      setEditingStructure(null);
      salaryForm.reset({
        effectiveFrom: todayLocal(),
        basicSalary: "0",
        allowances: "0",
        deductions: "0",
      });
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const deleteStructureMutation = useMutation({
    mutationKey: ["/api/employees", "salary-structure", "delete"],
    meta: scopedInvalidation,
    mutationFn: (data: { employeeId: number; id: number }) =>
      apiRequest("DELETE", `/api/employees/${data.employeeId}/salary-structures/${data.id}`),
    onSuccess: async () => {
      await invalidateApi(invalidationGroups.employees);
      if (editingStructure) setEditingStructure(null);
      toast({ title: "Deleted" });
    },
    onError: (err) => showApiError(err),
  });

  const createKhataEntryMutation = useMutation({
    mutationKey: ["/api/journal-vouchers", "khata-entry"],
    meta: scopedInvalidation,
    mutationFn: (data: KhataEntryFormData & { employeeAccountId: number }) => {
      if (!cashAccount) throw new Error("Cash in Hand account not found");
      const typeMeta = KHATA_TYPES.find((t) => t.value === data.type)!;
      const narration = data.note
        ? `${typeMeta.label}: ${data.note}`
        : typeMeta.label;
      const isDr = typeMeta.dir === "dr";
      return apiRequest("POST", "/api/journal-vouchers", {
        voucherDate: new Date(data.date),
        narration,
        status: "approved",
        debitAccountId: isDr ? data.employeeAccountId : cashAccount.id,
        debitAmount: data.amount,
        creditAccountId: isDr ? cashAccount.id : data.employeeAccountId,
        creditAmount: data.amount,
      });
    },
    onSuccess: async () => {
      await invalidateApi([...invalidationGroups.journal, "/api/ledger"]);
      setShowAddEntry(false);
      khataForm.reset({
        type: "advance_given",
        amount: "",
        date: todayLocal(),
        note: "",
      });
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const formatAmount = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(value || "0");
    if (!Number.isFinite(num)) return "0.00";
    return num.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const khataBalanceLabel = (value?: string | number) => {
    const num = typeof value === "number" ? value : parseFloat(value || "0");
    if (!Number.isFinite(num) || num === 0) return formatAmount(0);
    return num >= 0
      ? `${formatAmount(num)} DR`
      : `${formatAmount(Math.abs(num))} CR`;
  };

  const toggleClearedMutation = useMutation({
    mutationKey: ["/api/ledger", "toggle-cleared"],
    meta: scopedInvalidation,
    mutationFn: (entryId: number) =>
      apiRequest("PATCH", `/api/ledger/${entryId}/cleared`),
    onSuccess: async () => {
      await invalidateApi(["/api/ledger"]);
    },
    onError: (err) => showApiError(err),
  });

  const filteredKhataRows = useMemo(() => {
    if (!khataLedger) return [];
    let rows = khataLedger.rows;
    if (khataNarrationSearch.trim()) {
      const q = khataNarrationSearch.trim().toLowerCase();
      rows = rows.filter((r) => (r.narration || "").toLowerCase().includes(q));
    }
    if (!khataSortAsc) {
      rows = [...rows].reverse();
    }
    return rows;
  }, [khataLedger, khataNarrationSearch, khataSortAsc]);

  const handleExportKhataCsv = () => {
    if (!khataLedger || !khataEmployee) return;
    downloadCsv(
      `Khata_${khataEmployee.employeeCode}_${khataEmployee.name}.csv`,
      [
        { header: "Date", value: (r: LedgerRow) => format(new Date(r.entryDate), "yyyy-MM-dd") },
        { header: "Narration", value: (r: LedgerRow) => r.narration },
        { header: "Voucher", value: (r: LedgerRow) => `${r.vchType} ${r.vchNo}` },
        { header: "Debit", value: (r: LedgerRow) => r.debit },
        { header: "Credit", value: (r: LedgerRow) => r.credit },
        { header: "Balance", value: (r: LedgerRow) => r.runningBalance },
        { header: "Cleared", value: (r: LedgerRow) => r.cleared ? "Yes" : "No" },
      ],
      filteredKhataRows,
    );
  };

  const columns: Column<Employee>[] = useMemo(
    () => [
      { key: "employeeCode", title: "Code", render: (e) => <span className="font-mono">{e.employeeCode}</span> },
      { key: "name", title: t("name"), render: (e) => <span className="font-medium">{e.name}</span> },
      { key: "department", title: "Department", render: (e) => e.department || "-" },
      { key: "designation", title: "Designation", render: (e) => e.designation || "-" },
      { key: "basicSalary", title: "Basic", render: (e) => <span className="font-mono">{e.basicSalary || "0"}</span> },
      {
        key: "openingBalance",
        title: t("openingBalance"),
        render: (e) => {
          const type = String((e as any).openingBalanceType || "debit").toUpperCase();
          return (
            <span className="font-mono">
              {e.openingBalance || "0"} <span className="text-xs ml-1">{type === "CREDIT" ? "CR" : "DR"}</span>
            </span>
          );
        },
      },
      {
        key: "status",
        title: t("status"),
        render: (e) => (
          <Badge variant={String(e.status).toLowerCase() === "active" ? "default" : "secondary"}>
            {String(e.status).toLowerCase() === "active" ? "Active" : "Inactive"}
          </Badge>
        ),
      },
      {
        key: "actions",
        title: "",
        render: (e) => (
          <div className={`flex gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
            <Button
              size="sm"
              variant="outline"
              title="Khata"
              onClick={() => {
                setKhataEmployee(e);
                setOpenKhataDialog(true);
                setShowAddEntry(false);
                setKhataNarrationSearch("");
                setKhataSortAsc(true);
              }}
              disabled={!e.accountId}
              data-testid={`employee-khata-${e.id}`}
            >
              <BookOpen className="h-4 w-4" />
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setSalaryEmployee(e);
                setOpenSalaryDialog(true);
              }}
              data-testid={`employee-salary-${e.id}`}
            >
              <BadgeDollarSign className="h-4 w-4" />
            </Button>
            {canEdit && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditingEmployee(e);
                  employeeForm.reset({
                    name: e.name || "",
                    fatherName: e.fatherName || "",
                    cnic: e.cnic || "",
                    phone: e.phone || "",
                    email: e.email || "",
                    designation: e.designation || "",
                    department: e.department || "",
                    joiningDate: e.joiningDate ? toLocalDateString(new Date(e.joiningDate as any)) : "",
                    employmentType:
                      String((e.employmentType as any) || "permanent").toLowerCase() === "contract"
                        ? "contract"
                        : "permanent",
                    basicSalary: e.basicSalary || "0",
                    openingBalance: e.openingBalance || "0",
                    openingBalanceType:
                      String((e as any).openingBalanceType || "debit").toLowerCase() === "credit"
                        ? "credit"
                        : "debit",
                    status:
                      String((e.status as any) || "active").toLowerCase() === "inactive"
                        ? "inactive"
                        : "active",
                  });
                  setOpenEmployeeDialog(true);
                }}
                data-testid={`employee-edit-${e.id}`}
              >
                <Edit className="h-4 w-4" />
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, isRTL, canEdit, employeeForm],
  );

  const submitEmployee = (data: EmployeeFormData) => {
    if (editingEmployee) {
      updateEmployeeMutation.mutate({ ...data, id: editingEmployee.id });
    } else {
      createEmployeeMutation.mutate(data);
    }
  };

  const openCreateEmployee = () => {
    setEditingEmployee(null);
    employeeForm.reset({
      name: "",
      fatherName: "",
      cnic: "",
      phone: "",
      email: "",
      designation: "",
      department: "",
      joiningDate: "",
      employmentType: "permanent",
      basicSalary: "0",
      openingBalance: "0",
      status: "active",
    });
    setOpenEmployeeDialog(true);
  };

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "text-right" : ""}`}>
      <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="text-sm text-muted-foreground">Employee master and salary structures</p>
        </div>
        <Button
          onClick={() => {
            if (!canEdit) {
              toast({
                title: "Forbidden",
                description: "Only Admin/Manager/HR can create employees. Login with a permitted role.",
                variant: "destructive",
              });
              return;
            }
            openCreateEmployee();
          }}
          disabled={!canEdit}
          data-testid="employee-add"
          title={!canEdit ? "Requires Admin/Manager/HR role" : undefined}
        >
          <Plus className="h-4 w-4 mr-2" />
          {t("add")} Employee
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Employee List</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable columns={columns} data={employees} isLoading={isLoading} />
        </CardContent>
      </Card>

      <Dialog open={openEmployeeDialog} onOpenChange={setOpenEmployeeDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editingEmployee ? "Edit Employee" : "Add Employee"}</DialogTitle>
          </DialogHeader>
          <Form {...employeeForm}>
            <form onSubmit={employeeForm.handleSubmit(submitEmployee)} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={employeeForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("name")}</FormLabel>
                      <FormControl>
                        <Input {...field} data-testid="employee-name" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="fatherName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Father Name</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="cnic"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CNIC</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("phone")}</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="joiningDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Joining Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Department</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="designation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Designation</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="employmentType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Employment Type</FormLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="permanent">Permanent</SelectItem>
                          <SelectItem value="contract">Contract</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="basicSalary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Basic Salary</FormLabel>
                      <FormControl>
                        <Input {...field} inputMode="decimal" />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="openingBalance"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("openingBalance")}</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input
                            {...field}
                            type="number"
                            step="0.01"
                            min="0"
                            inputMode="decimal"
                            data-testid="employee-opening-balance"
                            className="flex-1"
                          />
                        </FormControl>
                        <FormField
                          control={employeeForm.control}
                          name="openingBalanceType"
                          render={({ field: typeField }) => (
                            <FormItem className="flex flex-col">
                              <FormLabel className="sr-only">Debit / Credit</FormLabel>
                              <Select
                                value={typeField.value}
                                onValueChange={typeField.onChange}
                              >
                                <FormControl>
                                  <SelectTrigger className="w-[110px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="debit">Debit</SelectItem>
                                  <SelectItem value="credit">Credit</SelectItem>
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={employeeForm.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("status")}</FormLabel>
                      <Select value={field.value || undefined} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                    </FormItem>
                  )}
                />
              </div>

              <Separator />
              <div className={`flex justify-end gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                <Button type="button" variant="outline" onClick={() => setOpenEmployeeDialog(false)}>
                  {t("cancel")}
                </Button>
                <Button type="submit" disabled={createEmployeeMutation.isPending || updateEmployeeMutation.isPending}>
                  {t("save")}
                </Button>
              </div>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      <Dialog
        open={openSalaryDialog}
        onOpenChange={(open) => {
          setOpenSalaryDialog(open);
          if (!open) {
            setSalaryEmployee(null);
            setEditingStructure(null);
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              Salary Structure {salaryEmployee ? `- ${salaryEmployee.employeeCode} ${salaryEmployee.name}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">History</CardTitle>
              </CardHeader>
              <CardContent>
                {isSalaryLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <SkeletonBox key={index} className="h-14 w-full" />
                    ))}
                  </div>
                ) : salaryStructures.length === 0 ? (
                  <div className="text-sm text-muted-foreground">{t("noRecords")}</div>
                ) : (
                  <div className="space-y-2">
                    {salaryStructures.map((s) => (
                      <div key={s.id} className="flex items-center justify-between rounded-md border p-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium">
                            Effective:{" "}
                            <span className="font-mono">
                              {toLocalDateString(new Date(s.effectiveFrom as any))}
                            </span>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            Basic: {s.basicSalary} | Allowances: {s.allowances} | Deductions: {s.deductions} | Net:{" "}
                            {s.netSalary}
                          </div>
                        </div>
                        <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                          <Badge variant="secondary">Net {s.netSalary}</Badge>
                          {canEdit && (
                            <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Edit structure"
                                onClick={() => {
                                  setEditingStructure(s);
                                  salaryForm.reset({
                                    effectiveFrom: toLocalDateString(new Date(s.effectiveFrom as any)),
                                    basicSalary: s.basicSalary || "0",
                                    allowances: s.allowances || "0",
                                    deductions: s.deductions || "0",
                                  });
                                }}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                title="Delete structure"
                                onClick={async () => {
                                  if (!salaryEmployee) return;
                                  const ok = await confirmAction("Delete this salary structure? This cannot be undone.");
                                  if (!ok) return;
                                  deleteStructureMutation.mutate({ employeeId: salaryEmployee.id, id: s.id });
                                }}
                                disabled={deleteStructureMutation.isPending}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {canEdit && salaryEmployee && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    {editingStructure ? "Edit Structure" : "Add New Structure"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Form {...salaryForm}>
                    <form
                      onSubmit={salaryForm.handleSubmit((data) => {
                        if (editingStructure) {
                          updateStructureMutation.mutate({ ...data, employeeId: salaryEmployee.id, id: editingStructure.id });
                        } else {
                          createStructureMutation.mutate({ ...data, employeeId: salaryEmployee.id });
                        }
                      })}
                      className="space-y-4"
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <FormField
                          control={salaryForm.control}
                          name="effectiveFrom"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Effective From</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={salaryForm.control}
                          name="basicSalary"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Basic Salary</FormLabel>
                              <FormControl>
                                <Input {...field} inputMode="decimal" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={salaryForm.control}
                          name="allowances"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Allowances (total)</FormLabel>
                              <FormControl>
                                <Input {...field} inputMode="decimal" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={salaryForm.control}
                          name="deductions"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Deductions (total)</FormLabel>
                              <FormControl>
                                <Input {...field} inputMode="decimal" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className={`flex justify-end gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                        {editingStructure && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setEditingStructure(null);
                              salaryForm.reset({
                                effectiveFrom: todayLocal(),
                                basicSalary: "0",
                                allowances: "0",
                                deductions: "0",
                              });
                            }}
                          >
                            {t("cancel")}
                          </Button>
                        )}
                        <Button
                          type="submit"
                          disabled={createStructureMutation.isPending || updateStructureMutation.isPending}
                        >
                          {t("save")}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Khata Dialog */}
      <Dialog
        open={openKhataDialog}
        onOpenChange={(open) => {
          setOpenKhataDialog(open);
          if (!open) {
            setKhataEmployee(null);
            setShowAddEntry(false);
          }
        }}
      >
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              Khata {khataEmployee ? `- ${khataEmployee.employeeCode} ${khataEmployee.name}` : ""}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Filters + Print + Export */}
            <div className="flex items-end gap-3 flex-wrap">
              <div className="w-52">
                <Label>Date Range</Label>
                <DateRangeFilter value={khataRange} onChange={setKhataRange} />
              </div>
              <div className="w-48">
                <Label>Search Narration</Label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    className="pl-8"
                    placeholder="Search..."
                    value={khataNarrationSearch}
                    onChange={(e) => setKhataNarrationSearch(e.target.value)}
                  />
                </div>
              </div>
              <PrintActions
                docKey={docKeys.ledger}
                params={{
                  accountId: khataEmployee?.accountId || undefined,
                  scope: "employee",
                  startDate: khataFrom || undefined,
                  endDate: khataTo || undefined,
                  language: isRTL ? "ur" : "en",
                }}
                title={`Khata - ${khataEmployee?.name || ""}`}
                disabled={!khataEmployee?.accountId}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleExportKhataCsv}
                disabled={!khataLedger || filteredKhataRows.length === 0}
                title="Export to CSV (opens in Excel)"
              >
                <Download className="h-4 w-4 mr-1" />
                Excel
              </Button>
              {canEdit && (
                <Button
                  size="sm"
                  onClick={() => setShowAddEntry(!showAddEntry)}
                  variant={showAddEntry ? "secondary" : "default"}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Entry
                </Button>
              )}
            </div>

            {/* Balance summary */}
            {khataLedger && (
              <div className="flex gap-4">
                <div className="rounded-md border px-4 py-2">
                  <div className="text-xs text-muted-foreground">Closing Balance</div>
                  <div className="text-lg font-semibold font-mono">
                    {khataBalanceLabel(khataLedger.totals.closingBalance)}
                  </div>
                </div>
                <div className="rounded-md border px-4 py-2">
                  <div className="text-xs text-muted-foreground">Total Debit</div>
                  <div className="font-mono">{formatAmount(khataLedger.totals.debit)}</div>
                </div>
                <div className="rounded-md border px-4 py-2">
                  <div className="text-xs text-muted-foreground">Total Credit</div>
                  <div className="font-mono">{formatAmount(khataLedger.totals.credit)}</div>
                </div>
              </div>
            )}

            {/* Add Entry Form */}
            {showAddEntry && canEdit && khataEmployee?.accountId && (
              <Card>
                <CardContent className="pt-4">
                  <Form {...khataForm}>
                    <form
                      onSubmit={khataForm.handleSubmit((data) => {
                        createKhataEntryMutation.mutate({
                          ...data,
                          employeeAccountId: khataEmployee.accountId!,
                        });
                      })}
                      className="space-y-3"
                    >
                      <div className="grid gap-3 md:grid-cols-4">
<FormField
                          control={khataForm.control}
                          name="type"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Type</FormLabel>
                              <Select value={field.value || undefined} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {KHATA_TYPES.map((t) => (
                                    <SelectItem key={t.value} value={t.value}>
                                      {t.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={khataForm.control}
                          name="amount"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Amount</FormLabel>
                              <FormControl>
                                <Input {...field} inputMode="decimal" placeholder="0.00" />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={khataForm.control}
                          name="date"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={khataForm.control}
                          name="note"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Note</FormLabel>
                              <FormControl>
                                <Input {...field} placeholder="Optional" />
                              </FormControl>
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" size="sm" onClick={() => setShowAddEntry(false)}>
                          {t("cancel")}
                        </Button>
                        <Button type="submit" size="sm" disabled={createKhataEntryMutation.isPending}>
                          {t("save")}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </CardContent>
              </Card>
            )}

            {/* Ledger Table */}
            <div className="border rounded-lg bg-white overflow-auto">
              <div className="min-w-[780px]">
                <div className="grid grid-cols-[90px,1fr,110px,110px,130px,60px] bg-muted/60 text-[11px] font-semibold uppercase tracking-wide border-b">
                  <button
                    type="button"
                    className="px-3 py-2 border-r text-left hover:bg-muted/80 cursor-pointer"
                    onClick={() => setKhataSortAsc(!khataSortAsc)}
                  >
                    Date {khataSortAsc ? "↑" : "↓"}
                  </button>
                  <div className="px-3 py-2 border-r">Narration</div>
                  <div className="px-3 py-2 border-r text-right">Debit</div>
                  <div className="px-3 py-2 border-r text-right">Credit</div>
                  <div className="px-3 py-2 border-r text-right">Balance</div>
                  <div className="px-3 py-2 text-center">Clr</div>
                </div>

                {isKhataLoading ? (
                  <div className="space-y-2 p-4">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <SkeletonBox key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : filteredKhataRows.length === 0 ? (
                  <div className="px-3 py-6 text-center text-muted-foreground text-sm">
                    No entries found.
                  </div>
                ) : (
                  filteredKhataRows.map((row, idx) => {
                    const debit = parseFloat(row.debit || "0");
                    const credit = parseFloat(row.credit || "0");
                    return (
                      <div
                        key={row.id}
                        className={clsx(
                          "grid grid-cols-[90px,1fr,110px,110px,130px,60px] text-sm border-b last:border-b-0",
                          idx % 2 === 0 ? "bg-white" : "bg-muted/20",
                          row.cleared && "opacity-60",
                        )}
                      >
                        <div className="px-3 py-2 border-r text-xs text-muted-foreground font-mono">
                          {format(new Date(row.entryDate), "dd.MM.yy")}
                        </div>
                        <div className="px-3 py-2 border-r text-sm">{row.narration}</div>
                        <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                          {debit > 0 ? formatAmount(debit) : "-"}
                        </div>
                        <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                          {credit > 0 ? formatAmount(credit) : "-"}
                        </div>
                        <div className="px-3 py-2 border-r text-right font-mono tabular-nums font-semibold">
                          {khataBalanceLabel(row.runningBalance)}
                        </div>
                        <div className="px-3 py-2 text-center">
                          {row.id > 0 && (
                            <input
                              type="checkbox"
                              checked={!!row.cleared}
                              onChange={() => toggleClearedMutation.mutate(row.id)}
                              className="h-4 w-4 cursor-pointer accent-primary"
                              title={row.cleared ? "Mark as uncleared" : "Mark as cleared"}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })
                )}

                {khataLedger && !isKhataLoading && filteredKhataRows.length > 0 && (
                  <div className="grid grid-cols-[90px,1fr,110px,110px,130px,60px] bg-muted/80 text-sm font-semibold border-t">
                    <div className="px-3 py-2 border-r" />
                    <div className="px-3 py-2 border-r">Totals</div>
                    <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                      {Number(khataLedger.totals.debit || 0) > 0 ? formatAmount(khataLedger.totals.debit) : "-"}
                    </div>
                    <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                      {Number(khataLedger.totals.credit || 0) > 0 ? formatAmount(khataLedger.totals.credit) : "-"}
                    </div>
                    <div className="px-3 py-2 border-r text-right font-mono tabular-nums">
                      {khataBalanceLabel(khataLedger.totals.closingBalance)}
                    </div>
                    <div className="px-3 py-2" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
