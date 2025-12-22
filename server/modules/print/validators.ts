import { z } from "zod";

export const printRequestSchema = z.object({
  docKey: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  format: z.enum(["A4"]).default("A4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
});

export type PrintRequestInput = z.infer<typeof printRequestSchema>;

