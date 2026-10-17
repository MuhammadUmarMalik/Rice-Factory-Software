import type { Request, Response } from "express";
import { z } from "zod";
import * as usersModel from "../models/users.model";
import * as fiscalService from "../services/fiscal-years.service";
import * as cashService from "../services/cash-in-hand.service";
import { readSettings, writeSettings } from "../services/settings.service";
import { asyncHandler, hashPassword, signAccessToken, verifyPassword } from "../utils/auth";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

// First-run onboarding: the admin account plus everything the mill needs before
// the first voucher — business profile, UI defaults, the opening fiscal year and
// opening cash. Only the admin fields are required.
const bootstrapSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(120),
  mill: z
    .object({
      businessName: z.string().trim().min(1).max(200),
      businessNameUrdu: z.string().trim().max(200).default(""),
      phone: z.string().trim().max(50).default(""),
      address: z.string().trim().max(500).default(""),
      ntn: z.string().trim().max(50).default(""),
      strn: z.string().trim().max(50).default(""),
      language: z.enum(["en", "ur"]).default("en"),
      theme: z.enum(["light", "dark"]).default("light"),
    })
    .optional(),
  fiscalYear: z
    .object({
      name: z.string().trim().min(1).max(50),
      startDate: z.coerce.date(),
      endDate: z.coerce.date(),
    })
    .refine((fy) => fy.endDate > fy.startDate, { message: "Fiscal year must end after it starts" })
    .optional(),
  openingCash: z.coerce.number().min(0).max(1e12).optional(),
});

function sanitizeUser(user: {
  id: number;
  username: string;
  fullName: string;
  role: string;
  mustChangePassword?: boolean;
}) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    // The client blocks the app shell on this, so /me must report it too — it
    // refreshes the stored user on every mount and would otherwise clear the flag.
    mustChangePassword: Boolean(user.mustChangePassword),
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid login payload" });
  }

  const { username, password } = parsed.data;
  const user = await usersModel.getUserByUsername(username);
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const { ok, needsUpgrade } = verifyPassword(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (needsUpgrade) {
    await usersModel.updateUser(user.id, { password: hashPassword(password) });
  }

  await new Promise<void>((resolve, reject) => {
    req.session.regenerate((err) => (err ? reject(err) : resolve()));
  });

  req.session.userId = user.id;
  req.session.role = user.role;
  req.session.username = user.username;

  const token = signAccessToken({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  });
  console.log(token)
  return res.json({ token, user: sanitizeUser(user) });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  await new Promise<void>((resolve) => {
    req.session.destroy(() => resolve());
  });
  res.clearCookie("connect.sid");
  return res.json({ ok: true });
});

export const me = asyncHandler(async (req: Request, res: Response) => {
  if (!req.user) return res.status(401).json({ error: "Unauthorized" });
  // Re-issue a short-lived access token on /me so every window (and the
  // real-time socket, which authenticates from this token) can bootstrap its
  // own session from the persistent session cookie without re-logging in.
  return res.json({ user: sanitizeUser(req.user), token: signAccessToken(req.user) });
});

export const bootstrapAdmin = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid bootstrap payload" });
  }

  const created = await usersModel.createFirstAdmin({
    username: parsed.data.username,
    password: hashPassword(parsed.data.password),
    fullName: parsed.data.fullName,
    role: "admin",
    isActive: true,
  });

  if (!created) {
    return res.status(403).json({ error: "Bootstrap already completed" });
  }

  // The admin row is the one-time gate, so it is written first; the rest runs
  // only for the caller that won it. A failure past this point leaves a usable
  // admin, so it is reported as a warning to finish in Settings, not a 500.
  // Cash goes before the fiscal year: creating the year snapshots every
  // account's opening balance, including the cash ledger account.
  const { mill, fiscalYear, openingCash } = parsed.data;
  const performedBy = { userId: created.id, role: created.role };
  const warnings: string[] = [];
  const step = async (label: string, fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (error) {
      console.error(`Bootstrap step failed: ${label}`, error);
      warnings.push(label);
    }
  };

  if (openingCash) await step("openingCash", () => cashService.updateCashAccountOpeningBalance(1, openingCash));
  if (fiscalYear) await step("fiscalYear", () => fiscalService.createFiscalYear({ ...fiscalYear, status: "open" }, performedBy));
  if (mill) await step("mill", async () => writeSettings({ ...(await readSettings()), ...mill }));

  return res.status(201).json({ user: sanitizeUser(created), warnings });
});

export const setupStatus = asyncHandler(async (_req: Request, res: Response) => {
  const users = await usersModel.getUsers();
  return res.json({ needsSetup: users.length === 0 });
});
