import { insertProductSchema } from "../db/schema";
import { numericString } from "./common";

export const productSchema = insertProductSchema.extend({
  currentStock: numericString.optional(),
  avgPurchasePrice: numericString.optional(),
  salePrice: numericString.optional(),
});

export const productUpdateSchema = productSchema.partial();
