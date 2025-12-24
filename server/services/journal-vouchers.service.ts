import { storage } from "../models/storage";

function buildJournalEntries(body: any) {
  return [
    { accountId: body.debitAccountId, entryType: "DEBIT" as const, amount: body.debitAmount },
    { accountId: body.creditAccountId, entryType: "CREDIT" as const, amount: body.creditAmount },
  ];
}

export async function listJournalVouchers() {
  const [vouchers, accountsList] = await Promise.all([
    storage.getJournalVouchers(),
    storage.getAccounts(),
  ]);
  const accountMap = new Map(accountsList.map((a) => [a.id, a.name]));

  return vouchers.map((v) => {
    const debit = v.entries.find((e) => e.entryType === "DEBIT");
    const credit = v.entries.find((e) => e.entryType === "CREDIT");
    return {
      ...v,
      debitAccountName: debit ? accountMap.get(debit.accountId) || "" : "",
      creditAccountName: credit ? accountMap.get(credit.accountId) || "" : "",
    };
  });
}

export async function getNextJournalNumber() {
  return storage.getNextJournalVoucherNumber();
}

export async function getJournalVoucher(id: number) {
  return storage.getJournalVoucher(id);
}

export async function createJournalVoucher(data: any) {
  const { debitAccountId, debitAmount, creditAccountId, creditAmount, ...header } = data;
  return storage.createJournalVoucher(header, buildJournalEntries(data));
}

export async function updateJournalVoucher(id: number, data: any) {
  const { debitAccountId, debitAmount, creditAccountId, creditAmount, ...header } = data;
  return storage.updateJournalVoucher(id, header, buildJournalEntries(data));
}

export async function approveJournalVoucher(id: number, approverId?: number) {
  return storage.approveJournalVoucher(id, approverId);
}

export async function deleteJournalVoucher(id: number) {
  return storage.deleteJournalVoucher(id);
}
