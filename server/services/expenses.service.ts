import * as expensesModel from "../models/expenses.model";

export async function listExpenses() {
  return expensesModel.getExpenses();
}

export async function createExpense(data: any, meta?: { userId?: number; role?: string }) {
  return expensesModel.createExpense(data, meta);
}

export async function updateExpense(id: number, data: any, meta?: { userId?: number; role?: string }) {
  return expensesModel.updateExpense(id, data, meta);
}

export async function deleteExpense(id: number) {
  return expensesModel.deleteExpense(id);
}
