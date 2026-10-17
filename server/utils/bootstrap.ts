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
