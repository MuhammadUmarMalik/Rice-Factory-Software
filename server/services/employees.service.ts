import { storage } from "../models/storage";

export async function listEmployees() {
  return storage.getEmployees();
}

export async function getEmployee(id: number) {
  return storage.getEmployee(id);
}

export async function createEmployee(data: any, createdBy?: number) {
  return storage.createEmployee({ ...data, createdBy } as any);
}

export async function updateEmployee(id: number, data: any) {
  return storage.updateEmployee(id, data);
}

export async function getSalaryStructures(employeeId: number) {
  return storage.getEmployeeSalaryStructures(employeeId);
}

export async function createSalaryStructure(employeeId: number, data: any, createdBy?: number) {
  return storage.createEmployeeSalaryStructure({ ...data, employeeId, createdBy } as any);
}
