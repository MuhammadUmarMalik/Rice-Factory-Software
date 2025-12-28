import type { PrintableDocumentPayload } from "@shared/print";

export type PrintFormat = "A4" | "A5" | "Letter" | "Legal" | "Custom";
export type PrintOrientation = "portrait" | "landscape";

export type PrintRequest = {
  docKey: string;
  params?: Record<string, unknown>;
  format?: PrintFormat;
  orientation?: PrintOrientation;
  widthMm?: number;
  heightMm?: number;
  marginMm?: number;
  marginTopMm?: number;
  marginRightMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
};

export type PrintRenderResult = {
  payload: PrintableDocumentPayload;
  html: string;
};
