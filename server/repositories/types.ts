import type {
  Account,
  InsertAccount,
  Product,
  InsertProduct,
  Purchase,
  InsertPurchase,
  PurchaseItem,
  PurchaseCharge,
  InsertPurchaseItem,
  InsertPurchaseCharge,
  Sale,
  InsertSale,
} from "../db/schema";

export type PurchaseItemInput = Omit<
  InsertPurchaseItem,
  "id" | "purchaseId" | "grossWeightKg" | "netWeightKg" | "moundQty" | "moundRemainderKg" | "amount"
> &
  Partial<
    Pick<
      InsertPurchaseItem,
      "grossWeightKg" | "netWeightKg" | "moundQty" | "moundRemainderKg" | "amount"
    >
  >;
export type PurchaseChargeInput = Omit<InsertPurchaseCharge, "id" | "purchaseId">;
export type SaleItemInput = Omit<import("../db/schema").InsertSaleItem, "id" | "saleId" | "totalPrice">;

export interface IAccountsRepository {
  getAccounts(type?: string, active?: boolean): Promise<Account[]>;
  getAccount(id: number): Promise<Account | undefined>;
  createAccount(account: InsertAccount): Promise<Account>;
  updateAccount(id: number, account: Partial<InsertAccount>): Promise<Account | undefined>;
  deleteAccount(id: number): Promise<boolean>;
}

export interface IProductsRepository {
  getProducts(): Promise<Product[]>;
  getActiveProducts(): Promise<Product[]>;
  getProduct(id: number): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: number, product: Partial<InsertProduct>): Promise<Product | undefined>;
  deleteProduct(id: number): Promise<boolean>;
}

export interface IPurchasesRepository {
  getPurchases(): Promise<Purchase[]>;
  getPurchase(id: number): Promise<Purchase | undefined>;
  getPurchaseWithDetails(
    id: number
  ): Promise<(Purchase & { items: PurchaseItem[]; charges: PurchaseCharge[] }) | undefined>;
  createPurchase(
    purchase: InsertPurchase,
    items: PurchaseItemInput[],
    charges: PurchaseChargeInput[],
    moundBaseKg?: number
  ): Promise<Purchase>;
  updatePurchase(
    id: number,
    purchase: Partial<InsertPurchase>,
    items: PurchaseItemInput[],
    charges: PurchaseChargeInput[],
    moundBaseKg?: number
  ): Promise<Purchase | undefined>;
  deletePurchase(id: number, deletedBy?: number, options?: { force?: boolean }): Promise<boolean>;
  getNextPurchaseBillNumber(): Promise<string>;
}

export interface ISalesRepository {
  getSales(): Promise<Sale[]>;
  getSale(id: number): Promise<Sale | undefined>;
  createSale(sale: InsertSale, items: SaleItemInput[]): Promise<Sale>;
  updateSale(id: number, sale: Partial<InsertSale>, items: SaleItemInput[]): Promise<Sale | undefined>;
  deleteSale(id: number): Promise<boolean>;
}
