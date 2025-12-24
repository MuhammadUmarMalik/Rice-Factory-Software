import { promises as fs } from "fs";
import path from "path";
import { settingsSchema } from "../schemas/settings.schema";

const settingsPath = path.join(process.cwd(), ".local", "settings.json");

export async function readSettings() {
  try {
    const raw = await fs.readFile(settingsPath, "utf-8");
    return settingsSchema.parse(JSON.parse(raw));
  } catch {
    return settingsSchema.parse({});
  }
}

export async function writeSettings(data: unknown) {
  const parsed = settingsSchema.parse(data);
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(parsed, null, 2), "utf-8");
  return parsed;
}
