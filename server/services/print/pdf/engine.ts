import type { PrintFormat, PrintOrientation } from "../types";
import { resolvePageSizeMm } from "../types";
import { escapeHtml } from "../../../views/print/base";

type PdfOptions = {
  orientation: PrintOrientation;
  format: PrintFormat;
  widthMm?: number;
  heightMm?: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  headerLabel?: string;
  companyName?: string;
  logoUrl?: string;
};

let browserPromise: Promise<import("playwright").Browser> | null = null;

/** Allows integration tests and graceful shutdown hooks to release Chromium. */
export async function closePdfBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (pending) {
    const browser = await pending;
    await browser.close();
  }
}

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await import("playwright");
    const noSandbox = process.env.PDF_DISABLE_SANDBOX === "1";
    browserPromise = chromium.launch({
      args: noSandbox ? ["--no-sandbox", "--disable-setuid-sandbox"] : [],
    });
  }
  return browserPromise;
}

const HEADER_MIN_TOP_MM = 12;
const FOOTER_MIN_BOTTOM_MM = 12;

export async function renderPdf(html: string, options: PdfOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  await page.emulateMedia({ media: "print" });

  const size = resolvePageSizeMm(options);

  const showHeader = options.marginTopMm >= HEADER_MIN_TOP_MM;
  const companyName = escapeHtml(options.companyName || "");
  const headerLabel = escapeHtml(options.headerLabel || "");
  const logoImg = options.logoUrl
    ? `<img src="${escapeHtml(options.logoUrl)}" style="width:20px;height:20px;object-fit:contain;border-radius:3px;margin-right:6px;" />`
    : "";

  const headerTemplate = showHeader
    ? `<div style="width:100%;font-size:8px;color:#6b7385;padding:0 ${options.marginLeftMm}mm;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #dde1e8;padding-bottom:2px;">
        <span style="display:flex;align-items:center;">${logoImg}<span style="font-weight:600;color:#1c2028;">${companyName}</span></span>
        <span>${headerLabel}</span>
      </div>`
    : `<div></div>`;

  const showFooter = options.marginBottomMm >= FOOTER_MIN_BOTTOM_MM;
  const footerTemplate = showFooter
    ? `<div style="width:100%;font-size:8px;color:#6b7385;padding:0 ${options.marginLeftMm}mm;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #dde1e8;padding-top:2px;">
        <span>${companyName}${headerLabel ? ` &mdash; ${headerLabel}` : ""}</span>
        <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
      </div>`
    : `<div></div>`;

  const pdf = await page.pdf({
    width: `${size.width}mm`,
    height: `${size.height}mm`,
    printBackground: true,
    margin: {
      top: `${options.marginTopMm}mm`,
      bottom: `${options.marginBottomMm}mm`,
      left: `${options.marginLeftMm}mm`,
      right: `${options.marginRightMm}mm`,
    },
    displayHeaderFooter: showHeader || showFooter,
    headerTemplate,
    footerTemplate,
  });

  await page.close();
  return Buffer.from(pdf);
}
