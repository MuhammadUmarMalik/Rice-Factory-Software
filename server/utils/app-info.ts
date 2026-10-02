import fs from "fs";
import path from "path";

export function getAppVersion(): string | undefined {
  // Same reason as config/static.ts: in a packaged app process.cwd() is the
  // install directory, which has no package.json. __dirname resolves to
  // dist/ inside the asar, so the manifest is one level up.
  const candidates = [
    typeof __dirname === "string" ? path.resolve(__dirname, "..", "package.json") : null,
    path.resolve(process.cwd(), "package.json"),
  ].filter((candidate): candidate is string => candidate !== null);

  for (const packagePath of candidates) {
    try {
      const raw = fs.readFileSync(packagePath, "utf-8");
      const parsed = JSON.parse(raw) as { version?: string };
      if (parsed.version) return parsed.version;
    } catch {
      // Try the next candidate.
    }
  }

  return undefined;
}
