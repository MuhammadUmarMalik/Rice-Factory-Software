import { storage } from "../models/storage";

export async function listPeriodLocks() {
  return storage.getPeriodLocks();
}

export async function createPeriodLock(data: any) {
  return storage.createPeriodLock(data as any);
}

export async function deletePeriodLock(id: number) {
  return storage.deletePeriodLock(id);
}
