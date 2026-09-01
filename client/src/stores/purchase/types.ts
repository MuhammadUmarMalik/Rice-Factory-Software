import type { Purchase } from "@/types/schema";
export type { RequestStatus } from "@/stores/base";

export type PurchaseItemDraft = {
  productId: string;
  marka?: string;
  bags: string;
  fillingPerBagKg: string;
  looseKgs: string;
  lessKg: string;
  bardanaKatKg: string;
  rate: string;
  rateUnit: "kg" | "mound" | "bag" | "quintal" | "ton";
};

export type PurchaseChargeDraft = {
  type:
    | "weight"
    | "freight"
    | "loading_filling"
    | "market_fee"
    | "mitha_sukri"
    | "other"
    | "phone_analysis"
    | "brokerage"
    | "commission"
    | "bardana"
    | "broken_allowance";
  mode: "add" | "less";
  amount: string;
  accountId?: string;
};

export type PurchaseDraft = {
  id?: number;
  purchaseDate?: string;
  moundBaseKg: "40" | "60";
  billNo?: string;
  bookNo?: string;
  supplierId: string;
  vehicleNumber?: string;
  brokerId?: string | null;
  brokerCommissionPercent: string;
  paidAmount: string;
  notes?: string;
  items: PurchaseItemDraft[];
  charges: PurchaseChargeDraft[];
};

export type PurchaseListItem = Purchase & {
  items?: any[];
  charges?: any[];
  supplier?: any;
};

export type PurchaseMode = "view" | "edit" | "create" | null;
