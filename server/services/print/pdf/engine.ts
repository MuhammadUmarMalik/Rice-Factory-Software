import type { PrintOrientation } from "../types";

type PdfOptions = {
  orientation: PrintOrientation;
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

  const pdf = await page.pdf({
    format: "A4",
    landscape: options.orientation === "landscape",
    printBackground: true,
    margin: { top: "14mm", bottom: "16mm", left: "12mm", right: "12mm" },
    displayHeaderFooter: true,
    footerTemplate: footer,
    headerTemplate: `<div></div>`,
  });

  await page.close();
  return Buffer.from(pdf);
}

