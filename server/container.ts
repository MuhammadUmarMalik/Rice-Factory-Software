/**
 * Simple DI container providing repositories and storage access.
 * Services can use repositories for better testability; storage remains for full compatibility.
 */
import { storage } from "./models/storage";
import {
  AccountsRepositoryAdapter,
  ProductsRepositoryAdapter,
  PurchasesRepositoryAdapter,
  SalesRepositoryAdapter,
} from "./repositories/storage-adapter";
import type {
  IAccountsRepository,
  IProductsRepository,
  IPurchasesRepository,
  ISalesRepository,
} from "./repositories/types";

const accountsRepo = new AccountsRepositoryAdapter();
const productsRepo = new ProductsRepositoryAdapter();
const purchasesRepo = new PurchasesRepositoryAdapter();
const salesRepo = new SalesRepositoryAdapter();

export const container = {
  /** Full storage - use for operations not yet in repositories */
  storage,

  /** Domain repositories - use for better testability and separation */
  accounts: accountsRepo as IAccountsRepository,
  products: productsRepo as IProductsRepository,
  purchases: purchasesRepo as IPurchasesRepository,
  sales: salesRepo as ISalesRepository,
};
