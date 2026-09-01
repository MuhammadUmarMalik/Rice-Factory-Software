import type { Request, Response } from "express";
import { z } from "zod";
import { storage } from "../models/storage";
import { hashPassword } from "../utils/auth";

const createUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(8),
  fullName: z.string().min(1),
  role: z.enum(["admin", "manager", "accountant", "hr", "operator"]).default("operator"),
  isActive: z.boolean().optional(),
});

const updateUserSchema = z.object({
  fullName: z.string().min(1).optional(),
  role: z.enum(["admin", "manager", "accountant", "hr", "operator"]).optional(),
  isActive: z.boolean().optional(),
  password: z.string().min(8).optional(),
});

function sanitizeUser(user: { id: number; username: string; fullName: string; role: string; isActive?: boolean }) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
  };
}

export async function listUsers(_req: Request, res: Response) {
  const users = await storage.getUsers();
  return res.json(users.map((u) => sanitizeUser(u)));
}

export async function createUser(req: Request, res: Response) {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid user payload" });
  }

  const created = await storage.createUser({
    username: parsed.data.username,
    password: hashPassword(parsed.data.password),
    fullName: parsed.data.fullName,
    role: parsed.data.role,
    isActive: parsed.data.isActive ?? true,
  });

  return res.status(201).json({ user: sanitizeUser(created) });
}

export async function updateUser(req: Request, res: Response) {
  const userId = Number(req.params.id);
  if (!Number.isFinite(userId)) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid user payload" });
  }

  const updates: Record<string, any> = { ...parsed.data };
  if (updates.password) {
    updates.password = hashPassword(updates.password);
  }

  const updated = await storage.updateUser(userId, updates);
  if (!updated) return res.status(404).json({ error: "User not found" });

  return res.json({ user: sanitizeUser(updated) });
}
