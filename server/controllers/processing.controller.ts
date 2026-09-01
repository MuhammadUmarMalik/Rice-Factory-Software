import type { Request, Response } from "express";
import { z } from "zod";
import { insertProcessingSchema } from "../db/schema";
import { numericString } from "../schemas/common";
import {
  processingCompleteSchema,
  processingOutputLineSchema,
  processingOutputUpdateSchema,
} from "../schemas/processing.schema";
import * as processingService from "../services/processing.service";
import { notifyLowStock, notifyUsers } from "../utils/notifications";
import { parseRequiredInt } from "../utils/parse";

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
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid processing id" });
    const batch = await processingService.getProcessingWithOutputs(id);
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
    try {
      await notifyLowStock(parsed.sourceProductId);
    } catch (notifyErr) {
      console.error("Low stock notification failed:", notifyErr);
    }
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
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid processing id" });
    const existing = await processingService.getProcessing(id);
    if (!existing) {
      return res.status(404).json({ error: "Processing batch not found" });
    }
    const data = insertProcessingSchema.partial().parse(req.body);
    const batch = await processingService.updateProcessing(id, data);
    if (!batch) {
      return res.status(404).json({ error: "Processing batch not found" });
    }
    const statusChanged = data.status && data.status !== existing.status;
    if (statusChanged && data.status === "in_progress") {
      await notifyUsers({
        title: "Processing started",
        message: `Batch ${existing.batchNumber} is in progress.`,
        type: "processing_start",
        entityType: "processing",
        entityId: existing.id,
      });
    } else if (statusChanged && data.status === "completed") {
      await notifyUsers({
        title: "Processing completed",
        message: `Batch ${existing.batchNumber} completed.`,
        type: "processing_complete",
        entityType: "processing",
        entityId: existing.id,
      });
    } else if (data.status === "in_progress") {
      await notifyUsers({
        title: "Processing progress update",
        message: `Batch ${existing.batchNumber} progress updated.`,
        type: "processing_progress",
        entityType: "processing",
        entityId: existing.id,
      });
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
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid processing id" });
    const existing = await processingService.getProcessing(id);
    if (!existing) {
      return res.status(404).json({ error: "Processing batch not found" });
    }

    if (existing.status != "pending") {
      return res.status(400).json({ error: "Batch already started" });
    }

    const batch = await processingService.updateProcessing(id, { status: "in_progress" });
    await notifyUsers({
      title: "Processing started",
      message: `Batch ${existing.batchNumber} is in progress.`,
      type: "processing_start",
      entityType: "processing",
      entityId: existing.id,
    });
    res.json(batch);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to start processing batch" });
  }
}

export async function completeProcessing(req: Request, res: Response) {
  try {
    const id = parseRequiredInt(req.params.id, "id");
    if (id === undefined) return res.status(400).json({ error: "Invalid processing id" });
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

    // Outputs are written while the batch is still in progress so that marking
    // it completed is what adds the yield to stock, exactly once.
    if (body.outputs?.length) {
      await processingService.setProcessingOutputs(id, body.outputs);
    }

    const batch = await processingService.updateProcessing(id, {
      status: "completed",
      ...(body.outputs?.length
        ? {}
        : { outputProductId: body.outputProductId, outputQuantity: body.outputQuantity }),
      wastageQuantity: body.wastageQuantity,
      outputCategory: body.outputCategory,
    });

    await notifyUsers({
      title: "Processing completed",
      message: `Batch ${existing.batchNumber} completed.`,
      type: "processing_complete",
      entityType: "processing",
      entityId: existing.id,
    });
    await notifyUsers({
      title: "New stock added",
      message: `Output from batch ${existing.batchNumber} added to stock.`,
      type: "stock_added",
      entityType: "processing",
      entityId: existing.id,
    });
    try {
      await notifyLowStock(existing.sourceProductId);
    } catch (notifyErr) {
      console.error("Low stock notification failed:", notifyErr);
    }
    res.json(batch);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to complete processing batch" });
  }
}

export async function listProcessingOutputs(req: Request, res: Response) {
  try {
    const processingId = parseRequiredInt(req.params.id, "id");
    if (processingId === undefined) return res.status(400).json({ error: "Invalid processing id" });
    const batch = await processingService.getProcessing(processingId);
    if (!batch) return res.status(404).json({ error: "Processing batch not found" });
    res.json(await processingService.listProcessingOutputs(processingId));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch processing outputs" });
  }
}

export async function replaceProcessingOutputs(req: Request, res: Response) {
  try {
    const processingId = parseRequiredInt(req.params.id, "id");
    if (processingId === undefined) return res.status(400).json({ error: "Invalid processing id" });
    const batch = await processingService.getProcessing(processingId);
    if (!batch) return res.status(404).json({ error: "Processing batch not found" });

    const outputs = z.array(processingOutputLineSchema).parse(req.body?.outputs ?? req.body);
    res.json(await processingService.setProcessingOutputs(processingId, outputs));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to replace processing outputs" });
  }
}

export async function addProcessingOutput(req: Request, res: Response) {
  try {
    const processingId = parseRequiredInt(req.params.id, "id");
    if (processingId === undefined) return res.status(400).json({ error: "Invalid processing id" });
    const batch = await processingService.getProcessing(processingId);
    if (!batch) return res.status(404).json({ error: "Processing batch not found" });

    const output = processingOutputLineSchema.parse(req.body);
    res.status(201).json(await processingService.addProcessingOutput(processingId, output));
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to add processing output" });
  }
}

export async function updateProcessingOutput(req: Request, res: Response) {
  try {
    const outputId = parseRequiredInt(req.params.outputId, "outputId");
    if (outputId === undefined) return res.status(400).json({ error: "Invalid output id" });

    const data = processingOutputUpdateSchema.parse(req.body);
    const updated = await processingService.updateProcessingOutput(outputId, data);
    if (!updated) return res.status(404).json({ error: "Processing output not found" });
    res.json(updated);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Failed to update processing output" });
  }
}

export async function deleteProcessingOutput(req: Request, res: Response) {
  try {
    const outputId = parseRequiredInt(req.params.outputId, "outputId");
    if (outputId === undefined) return res.status(400).json({ error: "Invalid output id" });
    const deleted = await processingService.deleteProcessingOutput(outputId);
    if (!deleted) return res.status(404).json({ error: "Processing output not found" });
    res.status(204).end();
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to delete processing output" });
  }
}
