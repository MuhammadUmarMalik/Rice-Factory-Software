/**
 * Repository implementations that delegate to the existing storage.
 * This provides abstraction for DI and future extraction.
 */
import { storage } from "../models/storage";
import type {
  IAccountsRepository,
  IProductsRepository,
  IPurchasesRepository,
  ISalesRepository,
  PurchaseItemInput,
  PurchaseChargeInput,
  SaleItemInput,
} from "./types";
import type { InsertAccount, InsertProduct, InsertPurchase, InsertSale } from "@shared/schema";

export class AccountsRepositoryAdapter implements IAccountsRepository {
  getAccounts = (type?: string, active?: boolean) =>
    storage.getAccounts(type, active);
  getAccount = (id: number) => storage.getAccount(id);
  createAccount = (account: InsertAccount) => storage.createAccount(account);
  updateAccount = (id: number, account: Partial<InsertAccount>) =>
    storage.updateAccount(id, account);
  deleteAccount = (id: number) => storage.deleteAccount(id);
}

export class ProductsRepositoryAdapter implements IProductsRepository {
  getProducts = () => storage.getProducts();
  getActiveProducts = () => storage.getActiveProducts();
  getProduct = (id: number) => storage.getProduct(id);
  createProduct = (product: InsertProduct) => storage.createProduct(product);
  updateProduct = (id: number, product: Partial<InsertProduct>) =>
    storage.updateProduct(id, product);
  deleteProduct = (id: number) => storage.deleteProduct(id);
}

export class PurchasesRepositoryAdapter implements IPurchasesRepository {
  getPurchases = () => storage.getPurchases();
  getPurchase = (id: number) => storage.getPurchase(id);
  getPurchaseWithDetails = (id: number) => storage.getPurchaseWithDetails(id);
  createPurchase = (
    purchase: InsertPurchase,
    items: PurchaseItemInput[],
    charges: PurchaseChargeInput[],
    moundBaseKg = 40
  ) => storage.createPurchase(purchase, items, charges, moundBaseKg);
  updatePurchase = (
    id: number,
    purchase: Partial<InsertPurchase>,
    items: PurchaseItemInput[],
    charges: PurchaseChargeInput[],
    moundBaseKg = 40
  ) => storage.updatePurchase(id, purchase, items, charges, moundBaseKg);
  deletePurchase = (id: number, deletedBy?: number, options?: { force?: boolean }) =>
    storage.deletePurchase(id, deletedBy, options);
  getNextPurchaseBillNumber = () => storage.getNextPurchaseBillNumber();
}

export class SalesRepositoryAdapter implements ISalesRepository {
  getSales = () => storage.getSales();
  getSale = (id: number) => storage.getSale(id);
  createSale = (sale: InsertSale, items: SaleItemInput[]) =>
    storage.createSale(sale, items);
  updateSale = (id: number, sale: Partial<InsertSale>, items: SaleItemInput[]) =>
    storage.updateSale(id, sale, items);
  deleteSale = (id: number) => storage.deleteSale(id);
}
