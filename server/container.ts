/**
 * Simple DI container providing the domain repositories.
 * Services resolve repositories from here for testability; everything else
 * imports the model modules under ./models directly.
 */
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
  /** Domain repositories - use for better testability and separation */
  accounts: accountsRepo as IAccountsRepository,
  products: productsRepo as IProductsRepository,
  purchases: purchasesRepo as IPurchasesRepository,
  sales: salesRepo as ISalesRepository,
};
