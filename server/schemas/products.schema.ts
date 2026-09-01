import { z } from "zod";
import { insertProductSchema } from "../db/schema";
import { numericString } from "./common";

export const productSchema = insertProductSchema.extend({
  name: z.string().trim().min(1, "Product name is required").max(150),
  nameUrdu: z.string().trim().max(150).nullish(),
  unit: z.string().trim().min(1).max(20).optional(),
  currentStock: numericString.optional(),
  avgPurchasePrice: numericString.optional(),
  salePrice: numericString.optional(),
  reorderLevel: numericString.optional(),
});

export const productUpdateSchema = productSchema
  .partial()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });
