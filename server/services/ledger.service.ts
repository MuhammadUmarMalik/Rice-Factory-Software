import { storage } from "../models/storage";

function normalizeVoucherType(value?: string) {
  if (!value) return undefined;
  const v = value.trim().toLowerCase();
  if (v == "sale" || v == "sales") return "sale";
  if (v == "purchase" || v == "purchases") return "purchase";
  if (v == "journal" || v == "jv" || v == "journal_voucher") return "journal_voucher";
  if (v == "receipt" || v == "crv" || v == "brv") return "receipt";
  if (v == "payment" || v == "cpv" || v == "bpv") return "payment";
  if (v == "expense" || v == "exp") return "expense";
  return undefined;
}

export async function getLedgerReport(params: {
  accountId: number;
  scope?: string;
  voucherType?: string;
  startDate?: Date;
  endDate?: Date;
  narration?: string;
}) {
  const scope = params.scope || "";
  const scopeRef =
    scope == "sales"
      ? "sale"
      : scope == "purchases"
        ? "purchase"
        : scope == "journal"
          ? "journal_voucher"
          : scope == "expenses"
            ? "expense"
            : scope == "payroll"
              ? "journal_voucher"
              : undefined;
  const voucherRef = normalizeVoucherType(params.voucherType);
  const referenceType = voucherRef || scopeRef;

  return storage.getLedgerReport({
    accountId: params.accountId,
    referenceType,
    startDate: params.startDate,
    endDate: params.endDate,
    narration: params.narration,
  });
}
