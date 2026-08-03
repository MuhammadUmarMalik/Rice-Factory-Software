import type { Request, Response } from "express";
import { z } from "zod";
import { storage } from "../models/storage";
import { asyncHandler, getUserId, hashPassword } from "../utils/auth";

const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(64)
  .regex(/^[A-Za-z0-9._-]+$/, "Username may only contain letters, numbers, dot, underscore or hyphen");

const createUserSchema = z.object({
  username: usernameSchema,
  password: z.string().min(8).max(200),
  fullName: z.string().trim().min(1).max(120),
  role: z.enum(["admin", "manager", "accountant", "hr", "operator"]).default("operator"),
  isActive: z.boolean().optional(),
});

const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    role: z.enum(["admin", "manager", "accountant", "hr", "operator"]).optional(),
    isActive: z.boolean().optional(),
    password: z.string().min(8).max(200).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided",
  });

function isUniqueViolation(err: any): boolean {
  const code = err?.code || err?.cause?.code;
  const message = String(err?.message || err?.cause?.message || "");
  return code === "SQLITE_CONSTRAINT_UNIQUE" || /UNIQUE constraint failed/i.test(message);
}

function sanitizeUser(user: { id: number; username: string; fullName: string; role: string; isActive?: boolean }) {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    isActive: user.isActive,
  };
}

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await storage.getUsers();
  return res.json(users.map((u) => sanitizeUser(u)));
});

export const createUser = asyncHandler(async (req: Request, res: Response) => {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid user payload" });
  }

  const existing = await storage.getUserByUsername(parsed.data.username);
  if (existing) {
    return res.status(409).json({ error: "Username is already taken" });
  }

  try {
    const created = await storage.createUser({
      username: parsed.data.username,
      password: hashPassword(parsed.data.password),
      fullName: parsed.data.fullName,
      role: parsed.data.role,
      isActive: parsed.data.isActive ?? true,
    });

    return res.status(201).json({ user: sanitizeUser(created) });
  } catch (err: any) {
    // The pre-check above can lose a race; the UNIQUE index is the real guard.
    if (isUniqueViolation(err)) {
      return res.status(409).json({ error: "Username is already taken" });
    }
    throw err;
  }
});

export const updateUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: "Invalid user id" });
  }

  const parsed = updateUserSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues[0]?.message || "Invalid user payload" });
  }

  const target = await storage.getUser(userId);
  if (!target) return res.status(404).json({ error: "User not found" });

  const losesAdmin =
    target.role === "admin" &&
    ((parsed.data.role !== undefined && parsed.data.role !== "admin") || parsed.data.isActive === false);

  if (losesAdmin) {
    // Guard against locking every administrator out of the application.
    if (getUserId(req) === userId) {
      return res.status(400).json({ error: "You cannot remove your own administrator access" });
    }
    const allUsers = await storage.getUsers();
    const otherActiveAdmins = allUsers.filter(
      (u) => u.id !== userId && u.role === "admin" && u.isActive,
    );
    if (otherActiveAdmins.length === 0) {
      return res.status(400).json({ error: "At least one active administrator must remain" });
    }
  }

  const updates: Record<string, any> = { ...parsed.data };
  if (updates.password) {
    updates.password = hashPassword(updates.password);
  }

  const updated = await storage.updateUser(userId, updates);
  if (!updated) return res.status(404).json({ error: "User not found" });

  return res.json({ user: sanitizeUser(updated) });
});
