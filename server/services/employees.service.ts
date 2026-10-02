import * as payrollModel from "../models/payroll.model";

export async function listEmployees() {
  return payrollModel.getEmployees();
}

export async function getEmployee(id: number) {
  return payrollModel.getEmployee(id);
}

export async function createEmployee(data: any, createdBy?: number) {
  return payrollModel.createEmployee({ ...data, createdBy } as any);
}

export async function updateEmployee(id: number, data: any) {
  return payrollModel.updateEmployee(id, data);
}

export async function getSalaryStructures(employeeId: number) {
  return payrollModel.getEmployeeSalaryStructures(employeeId);
}

export async function createSalaryStructure(employeeId: number, data: any, createdBy?: number) {
  return payrollModel.createEmployeeSalaryStructure({ ...data, employeeId, createdBy } as any);
}

export async function updateSalaryStructure(employeeId: number, structureId: number, data: any) {
  return payrollModel.updateEmployeeSalaryStructure(employeeId, structureId, data);
}

export async function deleteSalaryStructure(employeeId: number, structureId: number) {
  return payrollModel.deleteEmployeeSalaryStructure(employeeId, structureId);
}
