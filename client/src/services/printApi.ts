import { apiRequest } from "@/lib/queryClient";
import type { DocKey } from "@/print/docRegistry";

export type PrintRequest = {
  docKey: DocKey;
  params?: Record<string, unknown>;
  format?: "A4";
  orientation?: "portrait" | "landscape";
};

export async function fetchPrintPreview(request: PrintRequest): Promise<string> {
  const res = await apiRequest("POST", "/api/print/preview", request);
  const json = await res.json();
  return json.html as string;
}

export async function fetchPrintPdf(request: PrintRequest): Promise<Blob> {
  const res = await apiRequest("POST", "/api/print/pdf", request);
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: "application/pdf" });
}

