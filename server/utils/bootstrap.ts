import { storage } from "../models/storage";
import { hashPassword } from "./auth";

export async function ensureDesktopAdmin(): Promise<void> {
  if (process.env.DESKTOP_BUILD !== "1") return;

  const users = await storage.getUsers();
  if (users.length > 0) return;

  const username = process.env.DEFAULT_ADMIN_USERNAME;
  const password = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!username || !password) return;
  const fullName = process.env.DEFAULT_ADMIN_FULLNAME || "Administrator";

  await storage.createUser({
    username,
    password: hashPassword(password),
    fullName,
    role: "admin",
    isActive: true,
  });
}
