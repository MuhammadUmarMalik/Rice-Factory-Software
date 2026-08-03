import { z } from "zod";
import { numericString } from "./common";

export const saleItemsSchema = z
  .array(
    z.object({
      productId: z.number().int().positive(),
      quantity: numericString.refine((value) => Number(value) > 0, "Quantity must be greater than zero"),
      unit: z.enum(["kg", "mound", "quintal", "ton"]),
      pricePerUnit: numericString.refine((value) => Number(value) > 0, "Price must be greater than zero"),
    })
  )
  .min(1);
