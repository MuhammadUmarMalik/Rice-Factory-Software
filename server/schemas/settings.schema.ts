import { z } from "zod";

export const settingsSchema = z.object({
  businessName: z.string().default(""),
  businessNameUrdu: z.string().default(""),
  phone: z.string().default(""),
  address: z.string().default(""),
  logoUrl: z.string().optional().default(""),
  ntn: z.string().optional().default(""),
  strn: z.string().optional().default(""),
  language: z.enum(["en", "ur"]).default("en"),
  theme: z.enum(["light", "dark"]).default("light"),
  shortcuts: z
    .object({
      enabled: z.boolean().default(true),
      toggleSidebar: z.string().default("Ctrl+B"),
      printPreview: z.string().default("Ctrl+P"),
      downloadPdf: z.string().default("Ctrl+Shift+P"),
      newDialog: z.string().default("Ctrl+N"),
      saveDialog: z.string().default("Ctrl+Enter"),
      addLine: z.string().default("Ctrl+Shift+N"),
    })
    .default({}),
});
