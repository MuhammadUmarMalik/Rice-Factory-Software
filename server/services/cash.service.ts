import { storage } from "../models/storage";

export async function getCashSummary() {
  return storage.getCashSummary();
}

export async function getCashTransactions() {
  return storage.getCashTransactions();
}
