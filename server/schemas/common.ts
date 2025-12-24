import { z } from "zod";

export const numericString = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val) => {
    if (val == null || val == undefined || val == "") return "0";
    const num = typeof val == "number" ? val : parseFloat(val);
    if (!Number.isFinite(num) || num < 0) {
      throw new Error("Invalid numeric value");
    }
    return num.toString();
  });
