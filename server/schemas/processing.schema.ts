import { z } from "zod";
import { numericString } from "./common";

export const processingCompleteSchema = z.object({
  outputProductId: z.number().int().positive(),
  outputQuantity: numericString,
  wastageQuantity: numericString.optional(),
  outputCategory: z.enum(["rice_head", "broken_rice", "rice_polish", "kacher_nakoo"]),
});
