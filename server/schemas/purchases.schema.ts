import { z } from "zod";
import { insertPurchaseSchema } from "../db/schema";
import { numericString } from "./common";

export const purchaseItemsSchema = z
  .array(
    z.object({
      productId: z.number().int().positive(),
      serialNo: z.number().int().positive().optional(),
      marka: z.string().optional(),
      bags: numericString,
      fillingPerBagKg: numericString,
      looseKgs: numericString.optional().default("0"),
      grossWeightKg: numericString.optional(),
      lessKg: numericString.optional().default("0"),
      bardanaKatKg: numericString.optional().default("0"),
      netWeightKg: numericString.optional(),
      moundQty: numericString.optional(),
      moundRemainderKg: numericString.optional(),
      rate: numericString,
      rateUnit: z.enum(["kg", "mound", "bag", "quintal", "ton"]),
      amount: numericString.optional(),
    })
  )
  .min(1);

export const purchaseChargesSchema = z
  .array(
    z.object({
      type: z.enum([
        "weight",
        "freight",
        "loading_filling",
        "market_fee",
        "mitha_sukri",
        "other",
        "phone_analysis",
        "brokerage",
        "commission",
        "bardana",
        "broken_allowance",
        "accountant_clerk",
      ]),
      mode: z.enum(["add", "less"]).default("add"),
      amount: numericString,
      accountId: z.number().int().positive().optional(),
    })
  )
  .optional()
  .default([]);

export const purchaseInputSchema = insertPurchaseSchema
  .omit({ purchaseDate: true, dueDate: true })
  .extend({
    purchaseDate: z.preprocess((val) => {
      if (val == null || val == undefined || val == "") return undefined;
      return new Date(val as any);
    }, z.date().optional()),
    dueDate: z.preprocess((val) => {
      if (val == null || val == undefined || val == "") return undefined;
      return new Date(val as any);
    }, z.date().optional()),
    moundBaseKg: z.preprocess((val) => {
      const num = typeof val == "string" ? parseInt(val, 10) : Number(val);
      return num == 60 ? 60 : 40;
    }, z.number().optional()),
  });
