import { storage } from "../models/storage";

export async function listAccounts(type?: string, active?: boolean) {
  return storage.getAccounts(type, active);
}

export async function getAccount(id: number) {
  return storage.getAccount(id);
}

export async function createAccount(data: any) {
  return storage.createAccount(data);
}

export async function updateAccount(id: number, data: any) {
  return storage.updateAccount(id, data);
}

export async function deleteAccount(id: number) {
  return storage.deleteAccount(id);
}
