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
});
