import { z } from "zod";

export const printRequestSchema = z.object({
  docKey: z.string().min(1),
  params: z.record(z.unknown()).optional(),
  format: z.enum(["A4", "A5", "Letter", "Legal", "Thermal80", "Custom"]).default("A4"),
  orientation: z.enum(["portrait", "landscape"]).default("portrait"),
  widthMm: z.number().min(40).max(400).optional(),
  heightMm: z.number().min(40).max(1200).optional(),
  marginMm: z.number().min(0).max(40).optional(),
  marginTopMm: z.number().min(0).max(40).optional(),
  marginRightMm: z.number().min(0).max(40).optional(),
  marginBottomMm: z.number().min(0).max(40).optional(),
  marginLeftMm: z.number().min(0).max(40).optional(),
  colorMode: z.enum(["color", "grayscale", "bw"]).default("color"),
  showLogo: z.boolean().default(true),
  showColoredHeaders: z.boolean().default(true),
});

export type PrintRequestInput = z.infer<typeof printRequestSchema>;
