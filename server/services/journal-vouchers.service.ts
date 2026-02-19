import { storage } from "../models/storage";
import * as cashService from "./cash-in-hand.service";

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
  const voucher = await storage.createJournalVoucher(header, buildJournalEntries(data));
  if (voucher.status === "approved") {
    try {
      await cashService.syncCashFromJournalVoucher(voucher.id);
    } catch (err) {
      console.error("Cash sync from JV failed:", err);
    }
  }
  return voucher;
}

export async function updateJournalVoucher(id: number, data: any) {
  const { debitAccountId, debitAmount, creditAccountId, creditAmount, ...header } = data;
  return storage.updateJournalVoucher(id, header, buildJournalEntries(data));
}

export async function approveJournalVoucher(id: number, approverId?: number) {
  const voucher = await storage.approveJournalVoucher(id, approverId);
  if (voucher) {
    try {
      await cashService.syncCashFromJournalVoucher(id);
    } catch (err) {
      console.error("Cash sync from JV failed:", err);
    }
  }
  return voucher;
}

export async function deleteJournalVoucher(id: number) {
  return storage.deleteJournalVoucher(id);
}
