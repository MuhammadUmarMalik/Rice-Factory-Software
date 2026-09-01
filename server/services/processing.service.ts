import { storage } from "../models/storage";

export async function listProcessing() {
  const [batches, products] = await Promise.all([
    storage.getProcessingBatches(),
    storage.getProducts(),
  ]);

  const withOutputs = await Promise.all(
    batches.map(async (batch) => {
      const outputs = await storage.getProcessingOutputs(batch.id);
      return {
        ...batch,
        sourceProduct: products.find((p) => p.id === batch.sourceProductId),
        outputProduct: batch.outputProductId
          ? products.find((p) => p.id === batch.outputProductId)
          : undefined,
        outputs: outputs.map((output) => ({
          ...output,
          product: products.find((p) => p.id === output.productId),
        })),
      };
    }),
  );

  return withOutputs;
}

export async function getProcessing(id: number) {
  return storage.getProcessingBatch(id);
}

export async function getProcessingWithOutputs(id: number) {
  const batch = await storage.getProcessingBatch(id);
  if (!batch) return undefined;

  const [outputs, products] = await Promise.all([
    storage.getProcessingOutputs(id),
    storage.getProducts(),
  ]);

  return {
    ...batch,
    sourceProduct: products.find((p) => p.id === batch.sourceProductId),
    outputProduct: batch.outputProductId
      ? products.find((p) => p.id === batch.outputProductId)
      : undefined,
    outputs: outputs.map((output) => ({
      ...output,
      product: products.find((p) => p.id === output.productId),
    })),
  };
}

export async function createProcessing(data: any) {
  return storage.createProcessing(data);
}

export async function updateProcessing(id: number, data: any) {
  return storage.updateProcessing(id, data);
}

export async function listProcessingOutputs(processingId: number) {
  return storage.getProcessingOutputs(processingId);
}

export async function setProcessingOutputs(processingId: number, outputs: any[]) {
  return storage.setProcessingOutputs(processingId, outputs);
}

export async function addProcessingOutput(processingId: number, output: any) {
  return storage.addProcessingOutput(processingId, output);
}

export async function updateProcessingOutput(id: number, output: any) {
  return storage.updateProcessingOutput(id, output);
}

export async function deleteProcessingOutput(id: number) {
  return storage.deleteProcessingOutput(id);
}
