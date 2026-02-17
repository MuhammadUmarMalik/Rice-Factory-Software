import { z } from "zod";
import { numericString } from "./common";

export const saleItemsSchema = z
  .array(
    z.object({
      productId: z.number().int().positive(),
      quantity: numericString,
      unit: z.string().min(1),
      pricePerUnit: numericString,
    })
  )
  .min(1);
