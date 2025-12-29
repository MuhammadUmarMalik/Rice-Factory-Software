import type { Request, Response } from "express";
import { z } from "zod";
import { insertAccountSchema } from "@shared/schema";
import * as accountsService from "../services/accounts.service";
import { parseRequiredInt } from "../utils/parse";

export async function listAccounts(req: Request, res: Response) {
  try {
    const type = req.query.type as string | undefined;
    const accounts = await accountsService.listAccounts(type);
    res.json(accounts);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
}

export async function getAccount(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) {
      return res.status(400).json({ error: "Invalid account id" });
    }
    const account = await accountsService.getAccount(id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.json(account);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch account" });
  }
}

export async function createAccount(req: Request, res: Response) {
  try {
    const data = insertAccountSchema.parse(req.body);
    const account = await accountsService.createAccount(data);
    res.status(201).json(account);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create account" });
  }
}

export async function updateAccount(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) {
      return res.status(400).json({ error: "Invalid account id" });
    }
    const data = insertAccountSchema.partial().parse(req.body);
    const account = await accountsService.updateAccount(id, data);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    res.json(account);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update account" });
  }
}
