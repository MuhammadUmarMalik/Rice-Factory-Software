import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { PrintableCompany } from "@shared/print";

const settingsSchema = z.object({
  businessName: z.string().default(""),
  businessNameUrdu: z.string().default(""),
  phone: z.string().default(""),
  address: z.string().default(""),
  logoUrl: z.string().optional().default(""),
  ntn: z.string().optional().default(""),
  strn: z.string().optional().default(""),
});

const settingsPath = path.join(process.cwd(), ".local", "settings.json");

export async function readCompanyProfile(): Promise<PrintableCompany> {
  try {
    const raw = await fs.readFile(settingsPath, "utf-8");
    const parsed = settingsSchema.parse(JSON.parse(raw));
    return {
      name: parsed.businessName || "Company",
      address: parsed.address || "",
      phone: parsed.phone || "",
      logoUrl: parsed.logoUrl || undefined,
      ntn: parsed.ntn || undefined,
      strn: parsed.strn || undefined,
    };
  } catch {
    return {
      name: "Company",
      address: "",
      phone: "",
    };
  }
}

