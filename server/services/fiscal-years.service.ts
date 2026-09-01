import { storage } from "../models/storage";

export async function listFiscalYears() {
  return storage.getFiscalYears();
}

export async function listFiscalPeriods(fiscalYearId: number) {
  return storage.getFiscalPeriods(fiscalYearId);
}

export async function createFiscalYear(data: {
  name: string;
  startDate: Date;
  endDate: Date;
  status?: "draft" | "open" | "closed";
}, performedBy?: { userId?: number; role?: string }) {
  return storage.createFiscalYear(data as any, performedBy);
}

export async function setFiscalYearStatus(
  fiscalYearId: number,
  status: "draft" | "open" | "closed",
  performedBy?: { userId?: number; role?: string },
) {
  return storage.setFiscalYearStatus(fiscalYearId, status, performedBy);
}

export async function setFiscalPeriodClosed(
  periodId: number,
  isClosed: boolean,
  performedBy?: { userId?: number; role?: string },
) {
  return storage.setFiscalPeriodClosed(periodId, isClosed, performedBy);
}
