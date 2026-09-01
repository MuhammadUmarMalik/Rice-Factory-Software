import { storage } from "../models/storage";

export async function listPayrolls(params: { month?: string; status?: string; employeeId?: number }) {
  const rows = await storage.getPayrolls(params);
  const employeesList = await storage.getEmployees();
  const employeeMap = new Map(employeesList.map((e) => [e.id, e]));
  return rows.map((p) => ({ ...p, employee: employeeMap.get(p.employeeId) || null }));
}

export async function getPayrollById(id: number) {
  const payroll = await storage.getPayrollById(id);
  if (!payroll) return undefined;
  const employee = await storage.getEmployee(payroll.employeeId);
  return { ...payroll, employee: employee || null };
}

export async function generatePayroll(month: string, meta?: { userId?: number; role?: string }) {
  return storage.generateMonthlyPayroll(month, meta);
}

export async function approvePayroll(id: number, meta?: { userId?: number; role?: string }, postingDate?: Date) {
  return storage.approvePayroll(id, meta, postingDate);
}

export async function paySalary(
  id: number,
  payload: { method: "Cash" | "Bank"; paymentAccountId?: number; paymentDate?: Date },
  meta?: { userId?: number; role?: string },
) {
  return storage.paySalary(id, payload, meta);
}

export async function getPayrollAudit(id: number) {
  return storage.getPayrollAudit(id);
}

export async function updatePayroll(
  id: number,
  payload: { basicSalary?: number; allowances?: number; deductions?: number },
  meta?: { userId?: number; role?: string },
) {
  return storage.updatePayroll(id, payload, meta);
}

export async function deletePayroll(id: number, meta?: { userId?: number; role?: string }) {
  return storage.deletePayroll(id, meta);
}
