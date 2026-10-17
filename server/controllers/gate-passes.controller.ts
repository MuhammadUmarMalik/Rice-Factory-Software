import type { Request, Response } from "express";
import { z } from "zod";
import {
  gatePassCancelSchema,
  gatePassCreateSchema,
  gatePassListQuerySchema,
} from "../schemas/gate-passes.schema";
import * as gatePassesService from "../services/gate-passes.service";
import { isBusinessRuleError } from "../utils/errors";
import { parseRequiredInt } from "../utils/parse";

/**
 * Gate pass endpoints.
 *
 * Business-rule violations are thrown as plain `Error` by the model and mapped
 * to a 400 with the original message (`isBusinessRuleError`), so the client
 * always sees what to fix. Anything else is a 500 with a generic message.
 */

export async function listGatePasses(req: Request, res: Response) {
  try {
    const filters = gatePassListQuerySchema.parse(req.query);
    res.json(await gatePassesService.listGatePasses(filters));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to fetch gate passes" });
  }
}

export async function getGatePass(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid gate pass id" });
    const pass = await gatePassesService.getGatePass(id);
    if (!pass) return res.status(404).json({ error: "Gate pass not found" });
    res.json(pass);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch gate pass" });
  }
}

export async function createGatePass(req: Request, res: Response) {
  try {
    const input = gatePassCreateSchema.parse(req.body);
    const pass = await gatePassesService.createGatePass(input, req.user?.id);
    res.status(201).json(pass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create gate pass" });
  }
}

export async function completeGatePass(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid gate pass id" });
    const pass = await gatePassesService.completeGatePass(id, req.user?.id);
    if (!pass) return res.status(404).json({ error: "Gate pass not found" });
    res.json(pass);
  } catch (error) {
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to complete gate pass" });
  }
}

export async function cancelGatePass(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid gate pass id" });
    const { reason } = gatePassCancelSchema.parse(req.body);
    const pass = await gatePassesService.cancelGatePass(id, reason, req.user?.id);
    if (!pass) return res.status(404).json({ error: "Gate pass not found" });
    res.json(pass);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    if (isBusinessRuleError(error)) {
      return res.status(400).json({ error: error.message });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to cancel gate pass" });
  }
}

export async function getSaleDispatchSummary(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid sale id" });
    const summary = await gatePassesService.getSaleDispatchSummary(id);
    if (!summary) return res.status(404).json({ error: "Sale not found" });
    res.json(summary);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch dispatch summary" });
  }
}

export async function getGatePassDashboard(_req: Request, res: Response) {
  try {
    res.json(await gatePassesService.getDashboard());
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch gate pass dashboard" });
  }
}
