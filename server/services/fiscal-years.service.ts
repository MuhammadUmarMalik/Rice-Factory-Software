import * as fiscalYearsModel from "../models/fiscal-years.model";

export async function listFiscalYears() {
  return fiscalYearsModel.getFiscalYears();
}

export async function listFiscalPeriods(fiscalYearId: number) {
  return fiscalYearsModel.getFiscalPeriods(fiscalYearId);
}

export async function createFiscalYear(data: {
  name: string;
  startDate: Date;
  endDate: Date;
  status?: "draft" | "open" | "closed";
}, performedBy?: { userId?: number; role?: string }) {
  return fiscalYearsModel.createFiscalYear(data as any, performedBy);
}

export async function setFiscalYearStatus(
  fiscalYearId: number,
  status: "draft" | "open" | "closed",
  performedBy?: { userId?: number; role?: string },
) {
  return fiscalYearsModel.setFiscalYearStatus(fiscalYearId, status, performedBy);
}

export async function setFiscalPeriodClosed(
  periodId: number,
  isClosed: boolean,
  performedBy?: { userId?: number; role?: string },
) {
  return fiscalYearsModel.setFiscalPeriodClosed(periodId, isClosed, performedBy);
}
