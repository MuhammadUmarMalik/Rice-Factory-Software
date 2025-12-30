import { storage } from "../models/storage";

export async function listExpenses() {
  return storage.getExpenses();
}

export async function createExpense(data: any, meta?: { userId?: number; role?: string }) {
  return storage.createExpense(data, meta);
}

export async function updateExpense(id: number, data: any, meta?: { userId?: number; role?: string }) {
  return storage.updateExpense(id, data, meta);
}

export async function deleteExpense(id: number) {
  return storage.deleteExpense(id);
}
