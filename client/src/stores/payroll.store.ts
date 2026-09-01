import { createBaseStore, type RequestStatus } from "@/stores/base";

export type Employee = {
  id: number;
  name: string;
  role?: string;
  salary?: string;
  phone?: string;
  joinDate?: string;
};

export type Payroll = {
  id: number;
  employeeId: number;
  month: string;
  amount: string;
  status?: "pending" | "paid";
  notes?: string;
};

export type EmployeeDraft = Partial<Employee>;
export type PayrollDraft = Partial<Payroll>;

const employeeInitial = {
  list: [] as Employee[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as Employee | null,
  draft: null as EmployeeDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

const payrollInitial = {
  list: [] as Payroll[],
  filters: {} as Record<string, unknown>,
  sort: null,
  pagination: { page: 1, pageSize: 20, total: 0 },
  currentId: null as number | null,
  current: null as Payroll | null,
  draft: null as PayrollDraft | null,
  mode: null,
  request: {
    list: "idle" as RequestStatus,
    detail: "idle" as RequestStatus,
    save: "idle" as RequestStatus,
    delete: "idle" as RequestStatus,
  },
  error: undefined as string | undefined,
};

export const useEmployeesStore = createBaseStore<Employee, EmployeeDraft>(employeeInitial);
export const usePayrollStore = createBaseStore<Payroll, PayrollDraft>(payrollInitial);
