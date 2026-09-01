import { apiRequest } from "@/lib/queryClient";
import type { DocKey } from "@/print/docRegistry";
import type { PrintableDocumentPayload } from "@/types/print";

export type PrintFormat = "A4" | "A5" | "Letter" | "Legal" | "Thermal80" | "Custom";
export type PrintOrientation = "portrait" | "landscape";
export type PrintColorMode = "color" | "grayscale" | "bw";

export type PrintRequest = {
  docKey: DocKey;
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
  colorMode?: PrintColorMode;
  showLogo?: boolean;
  showColoredHeaders?: boolean;
};

const isElectron =
  typeof navigator !== "undefined" &&
  navigator.userAgent.toLowerCase().includes("electron");

const normalizeMargins = (request: PrintRequest) => {
  const uniform = request.marginMm ?? 10;
  return {
    marginTopMm: request.marginTopMm ?? uniform,
    marginRightMm: request.marginRightMm ?? uniform,
    marginBottomMm: request.marginBottomMm ?? uniform,
    marginLeftMm: request.marginLeftMm ?? uniform,
  };
};

const base64ToPdfBlob = (base64: string) => {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return new Blob([bytes], { type: "application/pdf" });
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
  if (isElectron && window.electronPrintPreview?.renderPdf) {
    try {
      const res = await apiRequest("POST", "/api/print/preview", request);
      const json = await res.json();
      const html = json.html as string | undefined;
      if (html) {
        const format = request.format ?? "A4";
        const orientation = request.orientation ?? "portrait";
        const margins = normalizeMargins(request);
        const base64 = await window.electronPrintPreview.renderPdf({
          html,
          options: {
            format,
            orientation,
            widthMm: request.widthMm,
            heightMm: request.heightMm,
            ...margins,
          },
        });
        if (base64) {
          return base64ToPdfBlob(base64);
        }
      }
    } catch {
      // Fall back to server-side PDF generation below.
    }
  }
  const res = await apiRequest("POST", "/api/print/pdf", request);
  const buf = await res.arrayBuffer();
  return new Blob([buf], { type: "application/pdf" });
}
