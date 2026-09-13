import * as reportsModel from "../models/reports.model";

export async function getIncomeStatement(fromDate: Date, toDate: Date) {
  return reportsModel.getIncomeStatement(fromDate, toDate);
}

export async function getBalanceSheet(asOfDate: Date) {
  return reportsModel.getBalanceSheet(asOfDate);
}

export async function getCapitalStatement(fromDate: Date, toDate: Date) {
  return reportsModel.getCapitalStatement(fromDate, toDate);
}

export async function getSalaryAccount(fromDate: Date, toDate: Date) {
  return reportsModel.getSalaryAccount(fromDate, toDate);
}
