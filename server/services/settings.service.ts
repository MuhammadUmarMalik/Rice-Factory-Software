import { promises as fs } from "fs";
import path from "path";
import { settingsSchema } from "../schemas/settings.schema";

const baseDir = process.env.APP_DATA_DIR ? process.env.APP_DATA_DIR : path.resolve(".local");
const settingsPath = path.join(baseDir, "settings.json");

export async function readSettings() {
  try {
    const raw = await fs.readFile(settingsPath, "utf-8");
    return settingsSchema.parse(JSON.parse(raw));
  } catch (error: any) {
    if (error?.code === "ENOENT") return settingsSchema.parse({});
    console.error(`Unable to read settings from ${settingsPath}:`, error);
    throw new Error("Settings file is corrupt or unreadable");
  }
}

export async function writeSettings(data: unknown) {
  const parsed = settingsSchema.parse(data);
  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  const tempPath = `${settingsPath}.${process.pid}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(parsed, null, 2), { encoding: "utf-8", mode: 0o600 });
  try {
    await fs.copyFile(settingsPath, `${settingsPath}.bak`);
  } catch (error: any) {
    if (error?.code !== "ENOENT") throw error;
  }
  await fs.rename(tempPath, settingsPath);
  return parsed;
}
