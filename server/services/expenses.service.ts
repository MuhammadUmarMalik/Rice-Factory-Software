import { storage } from "../models/storage";

export async function listExpenses() {
  return storage.getExpenses();
}

export async function createExpense(data: any, meta?: { userId?: number; role?: string }) {
  return storage.createExpense(data, meta);
}
