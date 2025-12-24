import type { Request, Response } from "express";
import { z } from "zod";
import { insertProcessingSchema } from "@shared/schema";
import { numericString } from "../schemas/common";
import { processingCompleteSchema } from "../schemas/processing.schema";
import * as processingService from "../services/processing.service";

export async function listProcessing(req: Request, res: Response) {
  try {
    const batches = await processingService.listProcessing();
    res.json(batches);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch processing batches" });
  }
}

export async function getProcessing(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const batch = await processingService.getProcessing(id);
    if (!batch) {
      return res.status(404).json({ error: "Processing batch not found" });
    }
    res.json(batch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch processing batch" });
  }
}

export async function createProcessing(req: Request, res: Response) {
  try {
    const parsed = insertProcessingSchema.parse(req.body);
    if (parsed.outputQuantity) {
      parsed.outputQuantity = numericString.parse(parsed.outputQuantity);
    }
    parsed.sourceQuantity = numericString.parse(parsed.sourceQuantity);
    const batch = await processingService.createProcessing(parsed);
    res.status(201).json(batch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to create processing batch" });
  }
}

export async function updateProcessing(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const data = insertProcessingSchema.partial().parse(req.body);
    const batch = await processingService.updateProcessing(id, data);
    if (!batch) {
      return res.status(404).json({ error: "Processing batch not found" });
    }
    res.json(batch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update processing batch" });
  }
}

export async function startProcessing(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const existing = await processingService.getProcessing(id);
    if (!existing) {
      return res.status(404).json({ error: "Processing batch not found" });
    }

    if (existing.status != "pending") {
      return res.status(400).json({ error: "Batch already started" });
    }

    const batch = await processingService.updateProcessing(id, { status: "in_progress" });
    res.json(batch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to start processing batch" });
  }
}

export async function completeProcessing(req: Request, res: Response) {
  try {
    const id = parseInt(req.params.id);
    const existing = await processingService.getProcessing(id);
    if (!existing) {
      return res.status(404).json({ error: "Processing batch not found" });
    }

    if (existing.status == "completed") {
      return res.status(400).json({ error: "Batch already completed" });
    }

    const body = processingCompleteSchema.parse(req.body);

    if (existing.status == "pending") {
      await processingService.updateProcessing(id, { status: "in_progress" });
    }

    const batch = await processingService.updateProcessing(id, {
      status: "completed",
      outputProductId: body.outputProductId,
      outputQuantity: body.outputQuantity,
      wastageQuantity: body.wastageQuantity,
      outputCategory: body.outputCategory,
    });

    res.json(batch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to complete processing batch" });
  }
}
