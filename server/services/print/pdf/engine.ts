import type { PrintFormat, PrintOrientation } from "../types";

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

export async function renderPdf(html: string, options: PdfOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: "networkidle" });

  const footer = `
    <div style="width:100%;font-size:9px;color:#64748b;padding:0 12mm;display:flex;justify-content:space-between;">
      <span>Rice Mill ERP</span>
      <span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span>
    </div>
  `;

  const safeMarginTop = Math.max(options.marginTopMm, 4);
  const safeMarginRight = Math.max(options.marginRightMm, 4);
  const safeMarginBottom = Math.max(options.marginBottomMm, 4);
  const safeMarginLeft = Math.max(options.marginLeftMm, 4);
  const useCustomSize =
    options.format === "Custom" && Number.isFinite(options.widthMm) && Number.isFinite(options.heightMm);
  const customWidth = Number(options.widthMm || 0);
  const customHeight = Number(options.heightMm || 0);
  const customSize = {
    width: options.orientation === "landscape" ? customHeight : customWidth,
    height: options.orientation === "landscape" ? customWidth : customHeight,
  };
  const pdf = await page.pdf({
    format: useCustomSize ? undefined : options.format,
    width: useCustomSize ? `${customSize.width}mm` : undefined,
    height: useCustomSize ? `${customSize.height}mm` : undefined,
    landscape: useCustomSize ? false : options.orientation === "landscape",
    printBackground: true,
    margin: {
      top: `${safeMarginTop}mm`,
      bottom: `${safeMarginBottom}mm`,
      left: `${safeMarginLeft}mm`,
      right: `${safeMarginRight}mm`,
    },
    displayHeaderFooter: true,
    footerTemplate: footer,
    headerTemplate: `<div></div>`,
  });

  await page.close();
  return Buffer.from(pdf);
}
