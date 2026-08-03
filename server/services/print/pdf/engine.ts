import type { PrintFormat, PrintOrientation } from "../types";
import { resolvePageSizeMm } from "../types";

type PdfOptions = {
  orientation: PrintOrientation;
  format: PrintFormat;
  widthMm?: number;
  heightMm?: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
};

let browserPromise: Promise<import("playwright").Browser> | null = null;

async function getBrowser() {
  if (!browserPromise) {
    const { chromium } = await import("playwright");
    browserPromise = chromium.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
  }
  return browserPromise;
}

/** Chromium needs ~8mm of bottom margin before a footer stops overlapping content. */
const FOOTER_MIN_BOTTOM_MM = 8;

export async function renderPdf(html: string, options: PdfOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });
  // The preview iframe renders screen media; force print media so the PDF matches
  // the `@media print` rules the preview simulates.
  await page.emulateMedia({ media: "print" });

  /*
   * Size is always passed explicitly rather than via Playwright's `format` +
   * `landscape` pair. `Thermal80` is not a Playwright format name, and mixing the
   * two mechanisms was how landscape and custom sizes ended up disagreeing with
   * the HTML's own `@page` size.
   */
  const size = resolvePageSizeMm(options);

  const showFooter = options.marginBottomMm >= FOOTER_MIN_BOTTOM_MM;
  const footer = `
    <div style="width:100%;font-size:9px;color:#64748b;padding:0 ${options.marginLeftMm}mm 0 ${options.marginRightMm}mm;display:flex;justify-content:space-between;">
      <span>Rice Mill ERP</span>
      <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>
  `;

  const pdf = await page.pdf({
    width: `${size.width}mm`,
    height: `${size.height}mm`,
    printBackground: true,
    // Margins are honoured exactly as requested, including 0mm. The document CSS
    // collapses its own padding under `@media print`, so the two never stack.
    margin: {
      top: `${options.marginTopMm}mm`,
      bottom: `${options.marginBottomMm}mm`,
      left: `${options.marginLeftMm}mm`,
      right: `${options.marginRightMm}mm`,
    },
    displayHeaderFooter: showFooter,
    footerTemplate: showFooter ? footer : `<div></div>`,
    headerTemplate: `<div></div>`,
  });

  await page.close();
  return Buffer.from(pdf);
}
