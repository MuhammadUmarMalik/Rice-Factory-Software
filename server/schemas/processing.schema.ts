import { z } from "zod";
import { numericString } from "./common";

export const processingOutputLineSchema = z.object({
  productId: z.number().int().positive(),
  quantity: numericString,
  outputType: z.enum(["raw", "bio"]).default("bio"),
  notes: z.string().optional(),
});

export const processingOutputUpdateSchema = processingOutputLineSchema.partial();

/**
 * A batch is completed either with a list of outputs or, for callers still on
 * the single-output shape, with outputProductId/outputQuantity. At least one of
 * the two must be present so a batch cannot complete with no yield at all.
 */
export const processingCompleteSchema = z
  .object({
    outputs: z.array(processingOutputLineSchema).optional(),
    outputProductId: z.number().int().positive().optional(),
    outputQuantity: numericString.optional(),
    wastageQuantity: numericString.optional(),
    outputCategory: z.enum(["rice_head", "broken_rice", "rice_polish", "kacher_nakoo"]).optional(),
  })
  .refine(
    (data) => (data.outputs?.length ?? 0) > 0 || (data.outputProductId !== undefined && data.outputQuantity !== undefined),
    { message: "Provide at least one output" },
  );
