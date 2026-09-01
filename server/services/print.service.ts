import { createHash } from "crypto";
import { renderDocumentHtml } from "../views/print/base";
import { renderPdf } from "./print/pdf/engine";
import { readCompanyProfile } from "./print/company";
import { printRequestSchema } from "./print/validators";
import type { PrintAppearance, PrintRenderResult, PrintRequest } from "./print/types";
import { getDocConfig } from "./print/registry";
import { getCached, setCached } from "./print/cache";

type UserContext = {
  role?: string;
  userId?: number;
  userLabel?: string;
};

function assertPrintAuthorized(config: { roles?: string[] }, user?: UserContext) {
  const role = user?.role?.toLowerCase();
  if (!role || !config.roles?.some((allowed) => allowed.toLowerCase() === role)) {
    const error = new Error("Forbidden") as Error & { status?: number };
    error.status = 403;
    throw error;
  }
}

type ParsedPrintRequest = ReturnType<typeof printRequestSchema.parse>;

/**
 * Single source of truth for page geometry and appearance. Preview, PDF and the
 * cache key all derive from this, so the three can never drift apart.
 */
function resolvePageOptions(parsed: ParsedPrintRequest) {
  const uniformMargin = parsed.marginMm ?? 10;
  const appearance: PrintAppearance = {
    colorMode: parsed.colorMode,
    showLogo: parsed.showLogo,
    showColoredHeaders: parsed.showColoredHeaders,
  };
  return {
    format: parsed.format,
    orientation: parsed.orientation,
    widthMm: parsed.widthMm,
    heightMm: parsed.heightMm,
    marginTopMm: parsed.marginTopMm ?? uniformMargin,
    marginRightMm: parsed.marginRightMm ?? uniformMargin,
    marginBottomMm: parsed.marginBottomMm ?? uniformMargin,
    marginLeftMm: parsed.marginLeftMm ?? uniformMargin,
    appearance,
  };
}

function hashParams(
  docKey: string,
  params: Record<string, unknown>,
  page: ReturnType<typeof resolvePageOptions>,
) {
  const payload = JSON.stringify({ docKey, params, page });
  return createHash("sha256").update(payload).digest("hex");
}

export async function renderPrintPreview(input: PrintRequest, user?: UserContext): Promise<PrintRenderResult> {
  const parsed = printRequestSchema.parse(input);
  const config = getDocConfig(parsed.docKey);
  if (!config) {
    throw new Error("Unsupported document type");
  }
  assertPrintAuthorized(config, user);

  const company = await readCompanyProfile();
  const now = new Date().toISOString();
  const payload = await config.mapper(parsed.params || {}, {
    company,
    createdBy: user?.userLabel || user?.role || "system",
    createdAt: now,
  });

  const html = renderDocumentHtml(payload, resolvePageOptions(parsed));
  return { payload, html };
}

export async function renderPrintPdf(input: PrintRequest, user?: UserContext): Promise<Buffer> {
  const parsed = printRequestSchema.parse(input);
  const config = getDocConfig(parsed.docKey);
  if (!config) {
    throw new Error("Unsupported document type");
  }
  assertPrintAuthorized(config, user);

  const params = parsed.params || {};
  const page = resolvePageOptions(parsed);
  const cacheKey = hashParams(parsed.docKey, params, page);
  if (config.cache) {
    const cached = getCached(cacheKey);
    if (cached?.pdf) return cached.pdf;
  }

  const result = await renderPrintPreview(input, user);
  const pdf = await renderPdf(result.html, {
    orientation: page.orientation,
    format: page.format,
    widthMm: page.widthMm,
    heightMm: page.heightMm,
    marginTopMm: page.marginTopMm,
    marginRightMm: page.marginRightMm,
    marginBottomMm: page.marginBottomMm,
    marginLeftMm: page.marginLeftMm,
  });

  if (config.cache) {
    setCached(cacheKey, { html: result.html, pdf, createdAt: Date.now() });
  }

  return pdf;
}

