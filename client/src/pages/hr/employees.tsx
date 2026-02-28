import { useMemo, useState } from "react";
import { Plus, Edit, BadgeDollarSign, Trash2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import type { Employee, EmployeeSalaryStructure } from "@/types/schema";

import { useLanguage } from "@/contexts/language-context";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { DataTable, type Column } from "@/components/data-table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
      status: "active",
    },
  });

  const salaryForm = useForm<SalaryStructureFormData>({
    resolver: zodResolver(salaryStructureSchema),
    defaultValues: {
      effectiveFrom: new Date().toISOString().slice(0, 10),
      basicSalary: "0",
      allowances: "0",
      deductions: "0",
    },
  });

  const { data: employees = [], isLoading } = useQuery<Employee[]>({
    queryKey: ["/api/employees"],
  });

  const { data: salaryStructures = [], isLoading: isSalaryLoading } = useQuery<EmployeeSalaryStructure[]>({
    queryKey: salaryEmployee ? [`/api/employees/${salaryEmployee.id}/salary-structures`] : ["__skip__"],
    enabled: !!salaryEmployee,
  });

  const createEmployeeMutation = useMutation({
    mutationFn: (data: EmployeeFormData) =>
      apiRequest("POST", "/api/employees", {
        ...data,
        joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setOpenEmployeeDialog(false);
      setEditingEmployee(null);
      employeeForm.reset();
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const updateEmployeeMutation = useMutation({
    mutationFn: (data: EmployeeFormData & { id: number }) =>
      apiRequest("PATCH", `/api/employees/${data.id}`, {
        ...data,
        joiningDate: data.joiningDate ? new Date(data.joiningDate) : undefined,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/employees"] });
      setOpenEmployeeDialog(false);
      setEditingEmployee(null);
      employeeForm.reset();
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const createStructureMutation = useMutation({
    mutationFn: (data: SalaryStructureFormData & { employeeId: number }) =>
      apiRequest("POST", `/api/employees/${data.employeeId}/salary-structures`, {
        ...data,
        effectiveFrom: new Date(data.effectiveFrom),
      }),
    onSuccess: async () => {
      if (salaryEmployee) {
        await queryClient.invalidateQueries({ queryKey: [`/api/employees/${salaryEmployee.id}/salary-structures`] });
      }
      salaryForm.reset({
        effectiveFrom: new Date().toISOString().slice(0, 10),
        basicSalary: "0",
        allowances: "0",
        deductions: "0",
      });
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const updateStructureMutation = useMutation({
    mutationFn: (data: SalaryStructureFormData & { employeeId: number; id: number }) =>
      apiRequest("PATCH", `/api/employees/${data.employeeId}/salary-structures/${data.id}`, {
        ...data,
        effectiveFrom: new Date(data.effectiveFrom),
      }),
    onSuccess: async () => {
      if (salaryEmployee) {
        await queryClient.invalidateQueries({ queryKey: [`/api/employees/${salaryEmployee.id}/salary-structures`] });
      }
      setEditingStructure(null);
      salaryForm.reset({
        effectiveFrom: new Date().toISOString().slice(0, 10),
        basicSalary: "0",
        allowances: "0",
        deductions: "0",
      });
      toast({ title: t("savedSuccessfully") });
    },
    onError: (err) => showApiError(err),
  });

  const deleteStructureMutation = useMutation({
    mutationFn: (data: { employeeId: number; id: number }) =>
      apiRequest("DELETE", `/api/employees/${data.employeeId}/salary-structures/${data.id}`),
    onSuccess: async () => {
      if (salaryEmployee) {
        await queryClient.invalidateQueries({ queryKey: [`/api/employees/${salaryEmployee.id}/salary-structures`] });
      }
      if (editingStructure) setEditingStructure(null);
      toast({ title: "Deleted" });
    },
    onError: (err) => showApiError(err),
  });

  const columns: Column<Employee>[] = useMemo(
    () => [
      { key: "employeeCode", title: "Code", render: (e) => <span className="font-mono">{e.employeeCode}</span> },
      { key: "name", title: t("name"), render: (e) => <span className="font-medium">{e.name}</span> },
      { key: "department", title: "Department", render: (e) => e.department || "-" },
      { key: "designation", title: "Designation", render: (e) => e.designation || "-" },
      { key: "basicSalary", title: "Basic", render: (e) => <span className="font-mono">{e.basicSalary || "0"}</span> },
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
                    joiningDate: e.joiningDate ? new Date(e.joiningDate as any).toISOString().slice(0, 10) : "",
                    employmentType:
                      String((e.employmentType as any) || "permanent").toLowerCase() === "contract"
                        ? "contract"
                        : "permanent",
                    basicSalary: e.basicSalary || "0",
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
                      <Select value={field.value} onValueChange={field.onChange}>
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
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t("status")}</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
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
                              {new Date(s.effectiveFrom as any).toISOString().slice(0, 10)}
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
                                    effectiveFrom: new Date(s.effectiveFrom as any).toISOString().slice(0, 10),
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
                                onClick={() => {
                                  if (!salaryEmployee) return;
                                  const ok = window.confirm("Delete this salary structure? This cannot be undone.");
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
                                effectiveFrom: new Date().toISOString().slice(0, 10),
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
    </div>
  );
}
