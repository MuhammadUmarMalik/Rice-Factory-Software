import { z } from "zod";

export const printRequestSchema = z.object({
  docKey: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  format: z.enum(["A4", "A5", "Letter", "Legal", "Custom"]).default("A4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  widthMm: z.number().min(80).max(400).optional(),
  heightMm: z.number().min(80).max(600).optional(),
  marginMm: z.number().min(0).max(25).optional(),
  marginTopMm: z.number().min(0).max(40).optional(),
  marginRightMm: z.number().min(0).max(40).optional(),
  marginBottomMm: z.number().min(0).max(40).optional(),
  marginLeftMm: z.number().min(0).max(40).optional(),
});

export type PrintRequestInput = z.infer<typeof printRequestSchema>;
