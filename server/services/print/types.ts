import type { PrintableDocumentPayload } from "../../types/print";

export type PrintFormat = "A4" | "A5" | "Letter" | "Legal" | "Thermal80" | "Custom";
export type PrintOrientation = "portrait" | "landscape";
export type PrintColorMode = "color" | "grayscale" | "bw";

export type PrintAppearance = {
  colorMode: PrintColorMode;
  showLogo: boolean;
  showColoredHeaders: boolean;
};

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
  colorMode?: PrintColorMode;
  showLogo?: boolean;
  showColoredHeaders?: boolean;
};

export type PrintRenderResult = {
  payload: PrintableDocumentPayload;
  html: string;
};

/** Physical paper sizes in millimetres, portrait orientation. */
export const PAPER_SIZES_MM: Record<Exclude<PrintFormat, "Custom">, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  // Continuous receipt roll. The height is a generous default: shorter content
  // just leaves the tail blank, longer content spills onto a second slip.
  Thermal80: { width: 80, height: 297 },
};

/** Roll paper has no meaningful landscape mode - never rotate it. */
export function isRollFormat(format: PrintFormat) {
  return format === "Thermal80";
}

export function resolvePageSizeMm(options: {
  format: PrintFormat;
  orientation: PrintOrientation;
  widthMm?: number;
  heightMm?: number;
}) {
  const base =
    options.format === "Custom"
      ? { width: options.widthMm || 210, height: options.heightMm || 297 }
      : PAPER_SIZES_MM[options.format];
  const rotate = options.orientation === "landscape" && !isRollFormat(options.format);
  return {
    width: rotate ? base.height : base.width,
    height: rotate ? base.width : base.height,
  };
}
