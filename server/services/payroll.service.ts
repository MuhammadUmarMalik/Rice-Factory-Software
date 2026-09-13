import * as payrollModel from "../models/payroll.model";

export async function listPayrolls(params: { month?: string; status?: string; employeeId?: number }) {
  const rows = await payrollModel.getPayrolls(params);
  const employeesList = await payrollModel.getEmployees();
  const employeeMap = new Map(employeesList.map((e) => [e.id, e]));
  return rows.map((p) => ({ ...p, employee: employeeMap.get(p.employeeId) || null }));
}

export async function getPayrollById(id: number) {
  const payroll = await payrollModel.getPayrollById(id);
  if (!payroll) return undefined;
  const employee = await payrollModel.getEmployee(payroll.employeeId);
  return { ...payroll, employee: employee || null };
}

export async function generatePayroll(month: string, meta?: { userId?: number; role?: string }) {
  return payrollModel.generateMonthlyPayroll(month, meta);
}

export async function approvePayroll(id: number, meta?: { userId?: number; role?: string }, postingDate?: Date) {
  return payrollModel.approvePayroll(id, meta, postingDate);
}

export async function paySalary(
  id: number,
  payload: { method: "Cash" | "Bank"; paymentAccountId?: number; paymentDate?: Date },
  meta?: { userId?: number; role?: string },
) {
  return payrollModel.paySalary(id, payload, meta);
}

export async function getPayrollAudit(id: number) {
  return payrollModel.getPayrollAudit(id);
}

export async function updatePayroll(
  id: number,
  payload: { basicSalary?: number; allowances?: number; deductions?: number },
  meta?: { userId?: number; role?: string },
) {
  return payrollModel.updatePayroll(id, payload, meta);
}

export async function deletePayroll(id: number, meta?: { userId?: number; role?: string }) {
  return payrollModel.deletePayroll(id, meta);
}
