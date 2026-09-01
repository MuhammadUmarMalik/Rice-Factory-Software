import { z } from "zod";

/**
 * Normalises money/quantity fields to a non-negative decimal string.
 *
 * Invalid input must surface as a ZodError so controllers answer 400. Throwing
 * a plain Error from inside the transform escaped `schema.parse()` uncaught, so
 * every malformed number was reported to the client as a 500.
 */
export const numericString = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((val, ctx) => {
    if (val == null || val === "") return "0";

    // `parseFloat` silently truncates ("1,234" -> 1), which would corrupt
    // amounts, so strings must be a complete numeric literal.
    if (typeof val === "string" && !/^[+-]?(\d+(\.\d*)?|\.\d+)$/.test(val.trim())) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Value must be a number",
      });
      return z.NEVER;
    }

    const num = typeof val === "number" ? val : parseFloat(val.trim());
    if (!Number.isFinite(num)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Value must be a number",
      });
      return z.NEVER;
    }
    if (num < 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Value must not be negative",
      });
      return z.NEVER;
    }
    return num.toString();
  });
