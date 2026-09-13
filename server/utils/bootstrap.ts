import * as usersModel from "../models/users.model";
import { hashPassword } from "./auth";

/**
 * Password the seed scripts fall back to when DEFAULT_ADMIN_PASSWORD is unset.
 * It ships in the repo, so any account created with it must be rotated on first
 * login — see `mustChangePassword` on the users table.
 */
export const FALLBACK_ADMIN_PASSWORD = "admin123";

/** True when an admin is being created with the publicly known fallback password. */
export function usesFallbackAdminPassword(password: string): boolean {
  return password === FALLBACK_ADMIN_PASSWORD;
}

export async function ensureDesktopAdmin(): Promise<void> {
  if (process.env.DESKTOP_BUILD !== "1") return;

  const users = await usersModel.getUsers();
  if (users.length > 0) return;

  const username = process.env.DEFAULT_ADMIN_USERNAME;
  const password = process.env.DEFAULT_ADMIN_PASSWORD;
  if (!username || !password) return;
  const fullName = process.env.DEFAULT_ADMIN_FULLNAME || "Administrator";

  await usersModel.createUser({
    username,
    password: hashPassword(password),
    fullName,
    role: "admin",
    isActive: true,
    // This path requires an explicit DEFAULT_ADMIN_PASSWORD, so it is normally
    // false; it still flags the case where the value handed in happens to be
    // the fallback password.
    mustChangePassword: usesFallbackAdminPassword(password),
  });
}
