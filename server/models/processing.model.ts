/**
 * Processing batch persistence, extracted from the "// Processing" section of
 * storage.ts.
 *
 * A batch consumes one source product and yields one or more output products
 * (rows in processing_outputs). Batches recorded before that table existed
 * keep their single yield in the batch row's outputProductId/outputQuantity
 * columns, so every stock path here has to handle both shapes.
 *
 * Stock only moves for a *completed* batch: the yield of a pending or
 * in-progress batch has not entered inventory yet. The source product, by
 * contrast, is consumed the moment the batch is created.
 */
import { db } from "./db";
import { desc, eq, inArray } from "drizzle-orm";
import {
  processing,
  processingOutputs,
  products,
  type Processing,
  type InsertProcessing,
  type ProcessingOutput,
  type InsertProcessingOutput,
} from "../db/schema";
import { buildProcessingNarration as buildProcessingNarrationText } from "../utils/narration";
import { updateProductStockOn } from "./products.model";

/** Either the shared client or a transaction-scoped one. */
type DbClient = typeof db;

export type ProcessingOutputInput = Omit<InsertProcessingOutput, "id" | "processingId">;

export async function getProcessingBatches(): Promise<Processing[]> {
  return db.select().from(processing).orderBy(desc(processing.startDate)).all();
}

export async function getProcessingBatch(id: number): Promise<Processing | undefined> {
  const [batch] = db.select().from(processing).where(eq(processing.id, id)).all();
  return batch;
}

export async function getNextBatchNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const [last] = db.select().from(processing)
    .orderBy(desc(processing.id))
    .limit(1)
    .all();

  const nextNum = last ? parseInt(last.batchNumber.split('-').pop() || '0') + 1 : 1;
  return `PRO-${year}-${String(nextNum).padStart(3, '0')}`;
}

export async function createProcessing(batch: InsertProcessing): Promise<Processing> {
  return db.transaction((tx) => {
    const year = new Date().getFullYear();
    const [last] = tx.select().from(processing).orderBy(desc(processing.id)).limit(1).all();
    const nextNum = last ? parseInt(last.batchNumber.split("-").pop() || "0") + 1 : 1;
    const batchNumber = `PRO-${year}-${String(nextNum).padStart(3, "0")}`;

    const client = tx as unknown as DbClient;

    const productIds = [batch.sourceProductId, batch.outputProductId].filter((id): id is number => Boolean(id));
    const productRows = productIds.length
      ? client.select({ id: products.id, name: products.name }).from(products).where(inArray(products.id, productIds)).all()
      : [];
    const productNameById = new Map(productRows.map((product) => [product.id, product.name]));
    const narration = buildProcessingNarrationText({
      notes: batch.notes,
      inputProduct: productNameById.get(batch.sourceProductId),
      inputQuantity: batch.sourceQuantity,
      outputProduct: batch.outputProductId ? productNameById.get(batch.outputProductId) : batch.outputCategory,
      outputQuantity: batch.outputQuantity,
      batchNumber,
    });

    // Reduce stock for source product
    updateProductStockOn(client, batch.sourceProductId, batch.sourceQuantity, "subtract");

    const insertResult = tx.insert(processing).values({
      ...batch,
      notes: narration,
      batchNumber,
    }).run();
    const newId = Number(insertResult.lastInsertRowid);
    const [newBatch] = tx.select().from(processing).where(eq(processing.id, newId)).all();

    return newBatch;
  });
}

export async function updateProcessing(id: number, batch: Partial<InsertProcessing>): Promise<Processing | undefined> {
  const existingBatch = await getProcessingBatch(id);
  if (!existingBatch) return undefined;

  return db.transaction((tx) => {
    const updatePayload: Partial<InsertProcessing> = { ...batch };
    const client = tx as unknown as DbClient;

    const nextSourceProductId = batch.sourceProductId ?? existingBatch.sourceProductId;
    const nextSourceQuantity = batch.sourceQuantity ?? existingBatch.sourceQuantity;
    const nextOutputProductId = batch.outputProductId ?? existingBatch.outputProductId;
    const nextOutputQuantity = batch.outputQuantity ?? existingBatch.outputQuantity;
    const nextStatus = batch.status ?? existingBatch.status;

    // A batch's yield lives in processing_outputs; batches recorded before
    // that table existed keep a single pair on the batch row. Read the rows
    // once so the reverse and re-apply below agree on which path is in play.
    const outputRows = client
      .select()
      .from(processingOutputs)
      .where(eq(processingOutputs.processingId, id))
      .all();

    const existingOutputs = outputRows.length
      ? outputRows.map((row) => ({ productId: row.productId, quantity: row.quantity }))
      : existingBatch.outputProductId && existingBatch.outputQuantity
        ? [{ productId: existingBatch.outputProductId, quantity: existingBatch.outputQuantity }]
        : [];

    // Output rows are edited through the processing-output methods, which
    // adjust stock themselves, so they are unchanged here. Only the legacy
    // pair can move as part of this update.
    const nextOutputs = outputRows.length
      ? existingOutputs
      : nextOutputProductId && nextOutputQuantity
        ? [{ productId: nextOutputProductId, quantity: nextOutputQuantity }]
        : [];

    updateProductStockOn(client, existingBatch.sourceProductId, existingBatch.sourceQuantity, "add");
    if (existingBatch.status === "completed") {
      for (const output of existingOutputs) {
        updateProductStockOn(client, output.productId, output.quantity, "subtract");
      }
    }
    updateProductStockOn(client, nextSourceProductId, nextSourceQuantity, "subtract");
    if (nextStatus === "completed") {
      for (const output of nextOutputs) {
        updateProductStockOn(client, output.productId, output.quantity, "add");
      }
    }

    if (batch.status === "in_progress" && existingBatch.status === "pending") {
      updatePayload.startDate = new Date();
    }

    if (nextStatus === "completed" && existingBatch.status !== "completed") {
      updatePayload.completedDate = new Date();
    } else if (nextStatus !== "completed") {
      updatePayload.completedDate = null;
    }

    tx.update(processing).set(updatePayload).where(eq(processing.id, id)).run();
    const [updated] = tx.select().from(processing).where(eq(processing.id, id)).all();
    return updated;
  });
}

export async function getProcessingOutputs(processingId: number): Promise<ProcessingOutput[]> {
  return db
    .select()
    .from(processingOutputs)
    .where(eq(processingOutputs.processingId, processingId))
    .orderBy(processingOutputs.id)
    .all();
}

/**
 * Replaces every output on a batch.
 *
 * Stock only moves for a completed batch: the yield of a pending or
 * in-progress batch has not been added to inventory yet, so rewriting its
 * outputs must not touch product stock.
 */
export async function setProcessingOutputs(processingId: number, outputs: ProcessingOutputInput[]): Promise<ProcessingOutput[]> {
  const batch = await getProcessingBatch(processingId);
  if (!batch) throw new Error("Processing batch not found");

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const isCompleted = batch.status === "completed";

    if (isCompleted) {
      for (const effect of currentOutputEffects(client, processingId, batch)) {
        updateProductStockOn(client, effect.productId, effect.quantity, "subtract");
      }
    }

    tx.delete(processingOutputs).where(eq(processingOutputs.processingId, processingId)).run();

    for (const output of outputs) {
      tx.insert(processingOutputs).values({ ...output, processingId }).run();
      if (isCompleted) {
        updateProductStockOn(client, output.productId, output.quantity, "add");
      }
    }

    // The legacy single-output columns are superseded once rows exist; clear
    // them so the fallback in currentOutputEffects can never double-count.
    if (outputs.length && (batch.outputProductId || batch.outputQuantity)) {
      tx.update(processing)
        .set({ outputProductId: null, outputQuantity: null })
        .where(eq(processing.id, processingId))
        .run();
    }

    return tx
      .select()
      .from(processingOutputs)
      .where(eq(processingOutputs.processingId, processingId))
      .orderBy(processingOutputs.id)
      .all();
  });
}

export async function addProcessingOutput(processingId: number, output: ProcessingOutputInput): Promise<ProcessingOutput> {
  const batch = await getProcessingBatch(processingId);
  if (!batch) throw new Error("Processing batch not found");

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const result = tx.insert(processingOutputs).values({ ...output, processingId }).run();
    if (batch.status === "completed") {
      updateProductStockOn(client, output.productId, output.quantity, "add");
    }
    const [created] = tx
      .select()
      .from(processingOutputs)
      .where(eq(processingOutputs.id, Number(result.lastInsertRowid)))
      .all();
    return created;
  });
}

export async function updateProcessingOutput(
  id: number,
  output: Partial<ProcessingOutputInput>,
): Promise<ProcessingOutput | undefined> {
  const [existing] = db.select().from(processingOutputs).where(eq(processingOutputs.id, id)).all();
  if (!existing) return undefined;
  const batch = await getProcessingBatch(existing.processingId);

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    const nextProductId = output.productId ?? existing.productId;
    const nextQuantity = output.quantity ?? existing.quantity;

    if (batch?.status === "completed") {
      updateProductStockOn(client, existing.productId, existing.quantity, "subtract");
      updateProductStockOn(client, nextProductId, nextQuantity, "add");
    }

    tx.update(processingOutputs)
      .set({ ...output, updatedAt: new Date() })
      .where(eq(processingOutputs.id, id))
      .run();
    const [updated] = tx.select().from(processingOutputs).where(eq(processingOutputs.id, id)).all();
    return updated;
  });
}

export async function deleteProcessingOutput(id: number): Promise<boolean> {
  const [existing] = db.select().from(processingOutputs).where(eq(processingOutputs.id, id)).all();
  if (!existing) return false;
  const batch = await getProcessingBatch(existing.processingId);

  return db.transaction((tx) => {
    const client = tx as unknown as DbClient;
    if (batch?.status === "completed") {
      updateProductStockOn(client, existing.productId, existing.quantity, "subtract");
    }
    tx.delete(processingOutputs).where(eq(processingOutputs.id, id)).run();
    return true;
  });
}

/**
 * The outputs currently reflected in stock for a batch: the rows in
 * processing_outputs, or the batch's own single-output columns for batches
 * recorded before that table existed.
 */
function currentOutputEffects(
  client: DbClient,
  processingId: number,
  batch: Pick<Processing, "outputProductId" | "outputQuantity">,
): Array<{ productId: number; quantity: string }> {
  const rows = client
    .select()
    .from(processingOutputs)
    .where(eq(processingOutputs.processingId, processingId))
    .all();
  if (rows.length) {
    return rows.map((row) => ({ productId: row.productId, quantity: row.quantity }));
  }
  if (batch.outputProductId && batch.outputQuantity) {
    return [{ productId: batch.outputProductId, quantity: batch.outputQuantity }];
  }
  return [];
}
