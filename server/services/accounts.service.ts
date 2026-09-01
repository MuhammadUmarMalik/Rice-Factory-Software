import { container } from "../container";

const repo = container.accounts;

export async function listAccounts(type?: string, active?: boolean) {
  return repo.getAccounts(type, active);
}

export async function getAccount(id: number) {
  return repo.getAccount(id);
}

export async function createAccount(data: Parameters<typeof repo.createAccount>[0]) {
  return repo.createAccount(data);
}

export async function updateAccount(id: number, data: Parameters<typeof repo.updateAccount>[1]) {
  return repo.updateAccount(id, data);
}

export async function deleteAccount(id: number) {
  return repo.deleteAccount(id);
}
