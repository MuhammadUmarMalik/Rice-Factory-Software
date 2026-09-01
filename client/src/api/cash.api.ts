import { apiRequest } from "@/lib/queryClient";

export type CashBalance = {
  openingBalance: number;
  totalReceipts: number;
  totalPayments: number;
  currentBalance: number;
};

export type CashSummary = {
  openingBalance: number;
  todayReceipts: number;
  todayPayments: number;
  closingBalance: number;
};

export type CashReceipt = {
  id: number;
  voucherNo: string;
  receiptDate: string | number;
  receivedFrom: string;
  amount: string;
  description?: string | null;
  paymentMode?: string;
  referenceType?: string | null;
  referenceId?: number | null;
  cashAccountId: number;
  invoiceRef?: string;
};

export type CashPayment = {
  id: number;
  voucherNo: string;
  paymentDate: string | number;
  paidTo: string;
  amount: string;
  description?: string | null;
  paymentMode?: string;
  referenceType?: string | null;
  referenceId?: number | null;
  cashAccountId: number;
  invoiceRef?: string;
};

export type LedgerRow = {
  date: number;
  voucherNo: string;
  type: "receipt" | "payment" | "opening";
  description: string;
  reference: string;
  referenceType?: string | null;
  referenceId?: number | null;
  debit: number;
  credit: number;
  balance: number;
};


export async function getBalance(date?: string): Promise<CashBalance> {
  const q = date ? `?date=${encodeURIComponent(date)}` : "";
  const res = await apiRequest("GET", `/api/cash/balance${q}`);
  return res.json();
}

export async function getSummary(): Promise<CashSummary> {
  const res = await apiRequest("GET", "/api/cash/summary");
  return res.json();
}

export async function getReceipts(params?: { from?: string; to?: string }): Promise<CashReceipt[]> {
  const sp = new URLSearchParams();
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  const q = sp.toString() ? `?${sp}` : "";
  const res = await apiRequest("GET", `/api/cash/receipts${q}`);
  return res.json();
}

export async function getReceipt(id: number): Promise<CashReceipt> {
  const res = await apiRequest("GET", `/api/cash/receipts/${id}`);
  return res.json();
}

export async function createReceipt(data: {
  receiptDate: string;
  receivedFrom: string;
  amount: string;
  description?: string;
  referenceType?: string;
  referenceId?: number;
}): Promise<CashReceipt> {
  const res = await apiRequest("POST", "/api/cash/receipts", data);
  return res.json();
}

export async function updateReceipt(id: number, data: Partial<{ receiptDate: string; receivedFrom: string; amount: string; description?: string }>): Promise<CashReceipt> {
  const res = await apiRequest("PUT", `/api/cash/receipts/${id}`, data);
  return res.json();
}

export async function deleteReceipt(id: number): Promise<void> {
  await apiRequest("DELETE", `/api/cash/receipts/${id}`);
}

export async function getPayments(params?: { from?: string; to?: string }): Promise<CashPayment[]> {
  const sp = new URLSearchParams();
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  const q = sp.toString() ? `?${sp}` : "";
  const res = await apiRequest("GET", `/api/cash/payments${q}`);
  return res.json();
}

export async function getPayment(id: number): Promise<CashPayment> {
  const res = await apiRequest("GET", `/api/cash/payments/${id}`);
  return res.json();
}

export async function createPayment(data: {
  paymentDate: string;
  paidTo: string;
  amount: string;
  description?: string;
  referenceType?: string;
  referenceId?: number;
}): Promise<CashPayment> {
  const res = await apiRequest("POST", "/api/cash/payments", data);
  return res.json();
}

export async function updatePayment(id: number, data: Partial<{ paymentDate: string; paidTo: string; amount: string; description?: string }>): Promise<CashPayment> {
  const res = await apiRequest("PUT", `/api/cash/payments/${id}`, data);
  return res.json();
}

export async function deletePayment(id: number): Promise<void> {
  await apiRequest("DELETE", `/api/cash/payments/${id}`);
}

export async function getLedger(params?: { from?: string; to?: string }): Promise<LedgerRow[]> {
  const sp = new URLSearchParams();
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  const q = sp.toString() ? `?${sp}` : "";
  const res = await apiRequest("GET", `/api/cash/ledger${q}`);
  return res.json();
}

