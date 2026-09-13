import * as periodLocksModel from "../models/period-locks.model";

export async function listPeriodLocks() {
  return periodLocksModel.getPeriodLocks();
}

export async function createPeriodLock(data: any) {
  return periodLocksModel.createPeriodLock(data as any);
}

export async function deletePeriodLock(id: number) {
  return periodLocksModel.deletePeriodLock(id);
}
