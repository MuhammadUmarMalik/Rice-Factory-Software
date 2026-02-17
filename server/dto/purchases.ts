import type { InsertPurchase } from "../db/schema";

/**
 * DTOs for Purchase API - replaces 'any' with explicit types.
 */
export type CreatePurchaseDto = Omit<InsertPurchase, "invoiceNumber" | "subtotal" | "totalAmount"> & {
  purchaseDate?: Date;
  billNo?: string;
  bookNo?: string;
  supplierId: number;
  brokerId?: number | null;
  items: CreatePurchaseItemDto[];
  charges: CreatePurchaseChargeDto[];
  moundBaseKg?: 40 | 60;
};

export type CreatePurchaseItemDto = {
  productId: number;
  serialNo?: number;
  marka?: string;
  bags: string;
  fillingPerBagKg: string;
  looseKgs?: string;
  lessKg?: string;
  bardanaKatKg?: string;
  rate: string;
  rateUnit: "kg" | "mound" | "bag" | "quintal" | "ton";
};

export type CreatePurchaseChargeDto = {
  type: string;
  mode?: "add" | "less";
  amount: string;
  accountId?: number;
};
