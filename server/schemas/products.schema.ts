import { insertProductSchema } from "@shared/schema";
import { numericString } from "./common";

export const productSchema = insertProductSchema.extend({
  currentStock: numericString.optional(),
  avgPurchasePrice: numericString.optional(),
  salePrice: numericString.optional(),
});

export const productUpdateSchema = productSchema.partial();
