import * as processingModel from "../models/processing.model";
import * as productsModel from "../models/products.model";

export async function listProcessing() {
  const [batches, products] = await Promise.all([
    processingModel.getProcessingBatches(),
    productsModel.getProducts(),
  ]);

  const withOutputs = await Promise.all(
    batches.map(async (batch) => {
      const outputs = await processingModel.getProcessingOutputs(batch.id);
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
  return processingModel.getProcessingBatch(id);
}

export async function getProcessingWithOutputs(id: number) {
  const batch = await processingModel.getProcessingBatch(id);
  if (!batch) return undefined;

  const [outputs, products] = await Promise.all([
    processingModel.getProcessingOutputs(id),
    productsModel.getProducts(),
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
  return processingModel.createProcessing(data);
}

export async function updateProcessing(id: number, data: any) {
  return processingModel.updateProcessing(id, data);
}

export async function listProcessingOutputs(processingId: number) {
  return processingModel.getProcessingOutputs(processingId);
}

export async function setProcessingOutputs(processingId: number, outputs: any[]) {
  return processingModel.setProcessingOutputs(processingId, outputs);
}

export async function addProcessingOutput(processingId: number, output: any) {
  return processingModel.addProcessingOutput(processingId, output);
}

export async function updateProcessingOutput(id: number, output: any) {
  return processingModel.updateProcessingOutput(id, output);
}

export async function deleteProcessingOutput(id: number) {
  return processingModel.deleteProcessingOutput(id);
}
