import type { Request, Response } from "express";
import { z } from "zod";
import { storage } from "../models/storage";
import { asyncHandler, hashPassword, signAccessToken, verifyPassword } from "../utils/auth";

const loginSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(200),
});

const bootstrapSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(120),
});

function sanitizeUser(user: { id: number; username: string; fullName: string; role: string }) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
  };
}

export const login = asyncHandler(async (req: Request, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid login payload" });
  }

  const { username, password } = parsed.data;
  const user = await storage.getUserByUsername(username);
  if (!user || !user.isActive) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  const { ok, needsUpgrade } = verifyPassword(password, user.password);
  if (!ok) {
    return res.status(401).json({ error: "Invalid credentials" });
  }

  if (needsUpgrade) {
    await storage.updateUser(user.id, { password: hashPassword(password) });
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
  return res.json({ user: sanitizeUser(req.user) });
});

export const bootstrapAdmin = asyncHandler(async (req: Request, res: Response) => {
  const parsed = bootstrapSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid bootstrap payload" });
  }

  const created = await storage.createFirstAdmin({
    username: parsed.data.username,
    password: hashPassword(parsed.data.password),
    fullName: parsed.data.fullName,
    role: "admin",
    isActive: true,
  });

  if (!created) {
    return res.status(403).json({ error: "Bootstrap already completed" });
  }

  return res.status(201).json({ user: sanitizeUser(created) });
});
