import fs from "fs";
import path from "path";

export function getAppVersion(): string | undefined {
  try {
    const packagePath = path.resolve(process.cwd(), "package.json");
    const raw = fs.readFileSync(packagePath, "utf-8");
    const parsed = JSON.parse(raw) as { version?: string };
    return parsed.version;
  } catch {
    return undefined;
  }
}
