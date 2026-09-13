/**
 * Repository implementations that delegate to the domain model modules.
 * This provides the abstraction the DI container hands to services.
 */
import * as accountsModel from "../models/accounts.model";
import * as productsModel from "../models/products.model";
import * as purchasesModel from "../models/purchases.model";
import * as salesModel from "../models/sales.model";
import type {
  IAccountsRepository,
  IProductsRepository,
  IPurchasesRepository,
  ISalesRepository,
  PurchaseItemInput,
  PurchaseChargeInput,
  SaleItemInput,
} from "./types";
import type { InsertAccount, InsertProduct, InsertPurchase, InsertSale } from "../db/schema";

export class AccountsRepositoryAdapter implements IAccountsRepository {
  getAccounts = (type?: string, active?: boolean) =>
    accountsModel.getAccounts(type, active);
  getAccount = (id: number) => accountsModel.getAccount(id);
  createAccount = (account: InsertAccount) => accountsModel.createAccount(account);
  updateAccount = (id: number, account: Partial<InsertAccount>) =>
    accountsModel.updateAccount(id, account);
  deleteAccount = (id: number) => accountsModel.deleteAccount(id);
}

export class ProductsRepositoryAdapter implements IProductsRepository {
  getProducts = () => productsModel.getProducts();
  getActiveProducts = () => productsModel.getActiveProducts();
  getProduct = (id: number) => productsModel.getProduct(id);
  createProduct = (product: InsertProduct) => productsModel.createProduct(product);
  updateProduct = (id: number, product: Partial<InsertProduct>) =>
    productsModel.updateProduct(id, product);
  deleteProduct = (id: number) => productsModel.deleteProduct(id);
}

export class PurchasesRepositoryAdapter implements IPurchasesRepository {
  getPurchases = () => purchasesModel.getPurchases();
  getPurchase = (id: number) => purchasesModel.getPurchase(id);
  getPurchaseWithDetails = (id: number) => purchasesModel.getPurchaseWithDetails(id);
  createPurchase = (
    purchase: InsertPurchase,
    items: PurchaseItemInput[],
    charges: PurchaseChargeInput[],
    moundBaseKg = 40
  ) => purchasesModel.createPurchase(purchase, items, charges, moundBaseKg);
  updatePurchase = (
    id: number,
    purchase: Partial<InsertPurchase>,
    items: PurchaseItemInput[],
    charges: PurchaseChargeInput[],
    moundBaseKg = 40
  ) => purchasesModel.updatePurchase(id, purchase, items, charges, moundBaseKg);
  deletePurchase = (id: number, deletedBy?: number, options?: { force?: boolean }) =>
    purchasesModel.deletePurchase(id, deletedBy, options);
  getPurchaseItems = (purchaseId: number) => purchasesModel.getPurchaseItems(purchaseId);
  getPurchaseCharges = (purchaseId: number) => purchasesModel.getPurchaseCharges(purchaseId);
  getNextPurchaseInvoiceNumber = () => purchasesModel.getNextPurchaseInvoiceNumber();
  getNextPurchaseBillNumber = () => purchasesModel.getNextPurchaseBillNumber();
}

export class SalesRepositoryAdapter implements ISalesRepository {
  getSales = () => salesModel.getSales();
  getSale = (id: number) => salesModel.getSale(id);
  createSale = (sale: InsertSale, items: SaleItemInput[]) =>
    salesModel.createSale(sale, items);
  updateSale = (id: number, sale: Partial<InsertSale>, items: SaleItemInput[]) =>
    salesModel.updateSale(id, sale, items);
  deleteSale = (id: number) => salesModel.deleteSale(id);
  getSaleItems = (saleId: number) => salesModel.getSaleItems(saleId);
  getNextSaleInvoiceNumber = () => salesModel.getNextSaleInvoiceNumber();
  getNextGatePassNumber = () => salesModel.getNextGatePassNumber();
}
