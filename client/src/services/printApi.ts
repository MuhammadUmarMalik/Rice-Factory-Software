import { apiRequest } from "@/lib/queryClient";
import type { DocKey } from "@/print/docRegistry";
import type { PrintableDocumentPayload } from "@shared/print";

export type PrintRequest = {
  docKey: DocKey;
  params?: Record<string, unknown>;
  format?: "A4" | "A5" | "Letter" | "Legal" | "Custom";
  orientation?: "portrait" | "landscape";
  widthMm?: number;
  heightMm?: number;
  marginMm?: number;
  marginTopMm?: number;
  marginRightMm?: number;
  marginBottomMm?: number;
  marginLeftMm?: number;
};

export async function fetchPrintPreview(request: PrintRequest): Promise<string> {
  const res = await apiRequest("POST", "/api/print/preview", request);
  const json = await res.json();
  return json.html as string;
}

export async function fetchPrintPayload(
  request: PrintRequest,
): Promise<PrintableDocumentPayload | null> {
  const res = await apiRequest("POST", "/api/print/preview", request);
  const json = await res.json();
  return (json.payload as PrintableDocumentPayload | undefined) || null;
}

export async function fetchPrintPdf(request: PrintRequest): Promise<Blob> {
  const res = await apiRequest("POST", "/api/print/pdf", request);
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: "application/pdf" });
}
