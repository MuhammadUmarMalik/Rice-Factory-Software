import type { DocKey } from "@/print/docRegistry";
import type { PrintColorMode, PrintFormat, PrintOrientation } from "@/services/printApi";

/**
 * Print settings the user last chose, remembered per document type. Sales
 * invoices are usually A4 with a logo, receipts are usually 80mm thermal without
 * one - a single global preference would fight the user on every switch.
 */
export type PrintSettings = {
  format: PrintFormat;
  orientation: PrintOrientation;
  widthMm: number;
  heightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  colorMode: PrintColorMode;
  showLogo: boolean;
  showColoredHeaders: boolean;
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  format: "A4",
  orientation: "portrait",
  widthMm: 210,
  heightMm: 297,
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  colorMode: "color",
  showLogo: true,
  showColoredHeaders: true,
};

export const PAPER_FORMATS: Array<{ value: PrintFormat; label: string }> = [
  { value: "A4", label: "A4 (210 x 297 mm)" },
  { value: "A5", label: "A5 (148 x 210 mm)" },
  { value: "Letter", label: "Letter (216 x 279 mm)" },
  { value: "Legal", label: "Legal (216 x 356 mm)" },
  { value: "Thermal80", label: "Thermal / Receipt (80 mm)" },
  { value: "Custom", label: "Custom" },
];

export const COLOR_MODES: Array<{ value: PrintColorMode; label: string }> = [
  { value: "color", label: "Full colour" },
  { value: "grayscale", label: "Grayscale" },
  { value: "bw", label: "Black & white only" },
];

/** Roll paper has no meaningful landscape mode. */
export function isRollFormat(format: PrintFormat) {
  return format === "Thermal80";
}

/** Mirrors PAPER_SIZES_MM in server/services/print/types.ts. */
export const PAPER_SIZES_MM: Record<Exclude<PrintFormat, "Custom">, { width: number; height: number }> = {
  A4: { width: 210, height: 297 },
  A5: { width: 148, height: 210 },
  Letter: { width: 216, height: 279 },
  Legal: { width: 216, height: 356 },
  Thermal80: { width: 80, height: 297 },
};

export function resolvePageSizeMm(settings: PrintSettings) {
  const base =
    settings.format === "Custom"
      ? { width: settings.widthMm, height: settings.heightMm }
      : PAPER_SIZES_MM[settings.format];
  const rotate = settings.orientation === "landscape" && !isRollFormat(settings.format);
  return {
    width: rotate ? base.height : base.width,
    height: rotate ? base.width : base.height,
  };
}

export const PX_PER_MM = 96 / 25.4;

const STORAGE_PREFIX = "print-settings:v1:";

function storageKey(docKey: DocKey) {
  return `${STORAGE_PREFIX}${docKey}`;
}

const FORMATS = new Set<PrintFormat>(PAPER_FORMATS.map((f) => f.value));
const MODES = new Set<PrintColorMode>(COLOR_MODES.map((m) => m.value));

function clampMargin(value: unknown, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(40, Math.max(0, n));
}

/** Never trust localStorage: a stale or hand-edited entry must not break print. */
function sanitize(raw: unknown, defaults: PrintSettings): PrintSettings {
  const value = (raw || {}) as Partial<PrintSettings>;
  const format = FORMATS.has(value.format as PrintFormat) ? (value.format as PrintFormat) : defaults.format;
  return {
    format,
    orientation: value.orientation === "landscape" && !isRollFormat(format) ? "landscape" : "portrait",
    widthMm: Math.min(400, Math.max(40, Number(value.widthMm) || defaults.widthMm)),
    heightMm: Math.min(1200, Math.max(40, Number(value.heightMm) || defaults.heightMm)),
    marginTopMm: clampMargin(value.marginTopMm, defaults.marginTopMm),
    marginRightMm: clampMargin(value.marginRightMm, defaults.marginRightMm),
    marginBottomMm: clampMargin(value.marginBottomMm, defaults.marginBottomMm),
    marginLeftMm: clampMargin(value.marginLeftMm, defaults.marginLeftMm),
    colorMode: MODES.has(value.colorMode as PrintColorMode)
      ? (value.colorMode as PrintColorMode)
      : defaults.colorMode,
    showLogo: typeof value.showLogo === "boolean" ? value.showLogo : defaults.showLogo,
    showColoredHeaders:
      typeof value.showColoredHeaders === "boolean"
        ? value.showColoredHeaders
        : defaults.showColoredHeaders,
  };
}

export function loadPrintSettings(docKey: DocKey, overrides?: Partial<PrintSettings>): PrintSettings {
  const defaults = { ...DEFAULT_PRINT_SETTINGS, ...overrides };
  if (typeof window === "undefined") return defaults;
  try {
    const stored = window.localStorage.getItem(storageKey(docKey));
    if (!stored) return defaults;
    return sanitize(JSON.parse(stored), defaults);
  } catch {
    return defaults;
  }
}

export function savePrintSettings(docKey: DocKey, settings: PrintSettings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(docKey), JSON.stringify(settings));
  } catch {
    // Private mode / quota exceeded - preferences simply don't persist.
  }
}

/** Converts stored settings into the wire shape both preview and PDF endpoints take. */
export function toPrintRequestOptions(settings: PrintSettings) {
  return {
    format: settings.format,
    orientation: settings.orientation,
    widthMm: settings.format === "Custom" ? settings.widthMm : undefined,
    heightMm: settings.format === "Custom" ? settings.heightMm : undefined,
    marginTopMm: settings.marginTopMm,
    marginRightMm: settings.marginRightMm,
    marginBottomMm: settings.marginBottomMm,
    marginLeftMm: settings.marginLeftMm,
    colorMode: settings.colorMode,
    showLogo: settings.showLogo,
    showColoredHeaders: settings.showColoredHeaders,
  };
}
