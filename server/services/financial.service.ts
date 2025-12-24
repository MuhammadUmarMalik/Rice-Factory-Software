import { storage } from "../models/storage";

export async function getIncomeStatement(fromDate: Date, toDate: Date) {
  return storage.getIncomeStatement(fromDate, toDate);
}

export async function getBalanceSheet(asOfDate: Date) {
  return storage.getBalanceSheet(asOfDate);
}

export async function getCapitalStatement(fromDate: Date, toDate: Date) {
  return storage.getCapitalStatement(fromDate, toDate);
}

export async function getSalaryAccount(fromDate: Date, toDate: Date) {
  return storage.getSalaryAccount(fromDate, toDate);
}
