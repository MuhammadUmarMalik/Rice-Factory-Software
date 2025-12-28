import { createHash } from "crypto";
import { renderDocumentHtml } from "../views/print/base";
import { renderPdf } from "./print/pdf/engine";
import { readCompanyProfile } from "./print/company";
import { printRequestSchema } from "./print/validators";
import type { PrintRenderResult, PrintRequest } from "./print/types";
import { getDocConfig } from "./print/registry";
import { getCached, setCached } from "./print/cache";

type UserContext = {
  role?: string;
  userId?: number;
  userLabel?: string;
};

function hashParams(
  docKey: string,
  params: Record<string, unknown>,
  orientation: string,
  format: string,
  marginMm: number,
  marginTopMm: number,
  marginRightMm: number,
  marginBottomMm: number,
  marginLeftMm: number,
  widthMm?: number,
  heightMm?: number,
) {
  const payload = JSON.stringify({
    docKey,
    params,
    orientation,
    format,
    marginMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
    widthMm,
    heightMm,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export async function renderPrintPreview(input: PrintRequest, user?: UserContext): Promise<PrintRenderResult> {
  const parsed = printRequestSchema.parse(input);
  const config = getDocConfig(parsed.docKey);
  if (!config) {
    throw new Error("Unsupported document type");
  }

  const company = await readCompanyProfile();
  const now = new Date().toISOString();
  const payload = await config.mapper(parsed.params || {}, {
    company,
    createdBy: user?.userLabel || user?.role || "system",
    createdAt: now,
  });

  const uniformMargin = parsed.marginMm ?? 10;
  const marginTopMm = parsed.marginTopMm ?? uniformMargin;
  const marginRightMm = parsed.marginRightMm ?? uniformMargin;
  const marginBottomMm = parsed.marginBottomMm ?? uniformMargin;
  const marginLeftMm = parsed.marginLeftMm ?? uniformMargin;
  const html = renderDocumentHtml(payload, {
    format: parsed.format,
    orientation: parsed.orientation,
    widthMm: parsed.widthMm,
    heightMm: parsed.heightMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
  });
  return { payload, html };
}

export async function renderPrintPdf(input: PrintRequest, user?: UserContext): Promise<Buffer> {
  const parsed = printRequestSchema.parse(input);
  const config = getDocConfig(parsed.docKey);
  if (!config) {
    throw new Error("Unsupported document type");
  }

  const params = parsed.params || {};
  const uniformMargin = parsed.marginMm ?? 10;
  const marginTopMm = parsed.marginTopMm ?? uniformMargin;
  const marginRightMm = parsed.marginRightMm ?? uniformMargin;
  const marginBottomMm = parsed.marginBottomMm ?? uniformMargin;
  const marginLeftMm = parsed.marginLeftMm ?? uniformMargin;
  const cacheKey = hashParams(
    parsed.docKey,
    params,
    parsed.orientation,
    parsed.format,
    uniformMargin,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
    parsed.widthMm,
    parsed.heightMm,
  );
  if (config.cache) {
    const cached = getCached(cacheKey);
    if (cached?.pdf) return cached.pdf;
  }

  const result = await renderPrintPreview(input, user);
  const pdf = await renderPdf(result.html, {
    orientation: parsed.orientation,
    format: parsed.format,
    widthMm: parsed.widthMm,
    heightMm: parsed.heightMm,
    marginTopMm,
    marginRightMm,
    marginBottomMm,
    marginLeftMm,
  });

  if (config.cache) {
    setCached(cacheKey, { html: result.html, pdf, createdAt: Date.now() });
  }

  return pdf;
}

