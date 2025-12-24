import type { PrintableDocumentPayload } from "@shared/print";

export type PrintFormat = "A4";
export type PrintOrientation = "portrait" | "landscape";

export type PrintRequest = {
  docKey: string;
  params?: Record<string, unknown>;
  format?: PrintFormat;
  orientation?: PrintOrientation;
};

export type PrintRenderResult = {
  payload: PrintableDocumentPayload;
  html: string;
};

