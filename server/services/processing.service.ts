import { storage } from "../models/storage";

export async function listProcessing() {
  const [batches, products] = await Promise.all([
    storage.getProcessingBatches(),
    storage.getProducts(),
  ]);

  return batches.map((batch) => ({
    ...batch,
    sourceProduct: products.find((p) => p.id === batch.sourceProductId),
    outputProduct: batch.outputProductId
      ? products.find((p) => p.id === batch.outputProductId)
      : undefined,
  }));
}

export async function getProcessing(id: number) {
  return storage.getProcessingBatch(id);
}

export async function createProcessing(data: any) {
  return storage.createProcessing(data);
}

export async function updateProcessing(id: number, data: any) {
  return storage.updateProcessing(id, data);
}
