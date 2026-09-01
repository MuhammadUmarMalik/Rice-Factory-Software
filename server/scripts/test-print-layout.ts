/**
 * Layout regression harness for the shared print template.
 *
 * Renders synthetic worst-case documents (very long company/customer names,
 * missing values, 12+ line items) at every paper size / orientation / margin
 * combination and asserts that nothing overflows the page horizontally, in both
 * screen (preview) and print (PDF) media.
 *
 * Run from server/:  npx tsx scripts/test-print-layout.ts
 */
import { chromium } from "playwright";
import { renderDocumentHtml } from "../views/print/base";
import { renderPdf } from "../services/print/pdf/engine";
import type { PrintAppearance, PrintFormat, PrintOrientation } from "../services/print/types";
import { resolvePageSizeMm } from "../services/print/types";
import type { PrintableDocumentPayload } from "../types/print";

const LONG_NAME =
  "Al-Hamd Superior Quality Rice Mills & General Trading Company (Private) Limited - Head Office";
const LONG_PARTY = "Muhammad Abdul Rehman Khan & Brothers Commission Shop, Grain Market, Okara";

const company: PrintableDocumentPayload["company"] = {
  name: LONG_NAME,
  address: "Plot 45-A, Industrial Estate Road, Near Railway Crossing, Okara, Punjab, Pakistan",
  phone: "+92-300-1234567",
  ntn: "1234567-8",
  strn: "0987654321098",
  logoUrl: "",
};

function lineItems(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    sr: String(i + 1),
    item: `Super Kernel Basmati Rice - Grade A Extra Long Sella Steam Polished Lot ${i + 1}`,
    qty: "1,250.00",
    rate: "Rs. 12,345.67",
    amount: "Rs. 15,432,098.76",
  }));
}

const invoicePayload: PrintableDocumentPayload = {
  docType: "INVOICE",
  docKey: "invoice.sales",
  title: "Sales Invoice",
  docNo: "SAL-2026-000123456",
  company,
  meta: {
    createdBy: "muhammad.umar.malik@millmanager.example",
    createdAt: "2026-08-02T10:15:00.000Z",
    dateFrom: "01 Jan 2026",
    dateTo: "02 Aug 2026",
    filters: { Vehicle: "LEB-9988-XY", GatePass: "GP-2026-00045678" },
  },
  sections: [
    { label: "Customer", value: LONG_PARTY, highlight: true },
    { label: "Total", value: "Rs. 18,532,098.76", highlight: true },
    { label: "Missing", value: "" },
  ],
  table: {
    columns: [
      { key: "sr", label: "Sr", width: "6%" },
      { key: "item", label: "Item" },
      { key: "qty", label: "Qty", align: "right" },
      { key: "rate", label: "Rate", align: "right" },
      { key: "amount", label: "Amount", align: "right" },
    ],
    rows: lineItems(14),
    totalsRow: { sr: "", item: "Totals", qty: "", rate: "", amount: "Rs. 18,532,098.76" },
  },
  notes: "Payment pending until moisture re-check is completed at the buyer's warehouse.",
  signatures: [{ label: "Prepared By" }, { label: "Approved By" }, { label: "Received By" }],
  settings: { currency: "PKR", showWatermark: true, watermarkText: "DRAFT" },
};

/** Wide report: 12 numeric columns is the worst case for horizontal fit. */
const stockPayload: PrintableDocumentPayload = {
  docType: "REPORT",
  docKey: "report.stock",
  title: "Stock Report",
  company,
  meta: {
    createdBy: "system",
    createdAt: "2026-08-02T10:15:00.000Z",
    filters: { Product: "All", Category: "All", Unit: "All" },
  },
  table: {
    columns: [
      { key: "itemCode", label: "Item Code" },
      { key: "itemName", label: "Item Name" },
      { key: "category", label: "Category" },
      { key: "unit", label: "Unit", align: "center" },
      { key: "openingQty", label: "Opening Qty", align: "right" },
      { key: "openingValue", label: "Opening Value", align: "right" },
      { key: "inQty", label: "In Qty", align: "right" },
      { key: "inValue", label: "In Value", align: "right" },
      { key: "outQty", label: "Out Qty", align: "right" },
      { key: "outValue", label: "Out Value", align: "right" },
      { key: "closingQty", label: "Closing Qty", align: "right" },
      { key: "closingValue", label: "Closing Value", align: "right" },
    ],
    rows: Array.from({ length: 12 }, (_, i) => ({
      itemCode: `PRD-${1000 + i}`,
      itemName: `Super Kernel Basmati Rice Grade A Extra Long Sella ${i + 1}`,
      category: "Finished Goods",
      unit: "kg",
      openingQty: "123,456.00",
      openingValue: "Rs. 12,345,678.00",
      inQty: "98,765.00",
      inValue: "Rs. 9,876,543.00",
      outQty: "87,654.00",
      outValue: "Rs. 8,765,432.00",
      closingQty: "134,567.00",
      closingValue: "Rs. 13,456,789.00",
    })),
  },
  settings: { currency: "PKR" },
};

/** Every optional field absent - the null-safety case. */
const sparsePayload: PrintableDocumentPayload = {
  docType: "REPORT",
  docKey: "report.dayBook",
  title: "Day Book",
  company: { name: "C" },
  meta: { createdAt: "2026-08-02T10:15:00.000Z" },
  table: {
    columns: [
      { key: "srNo", label: "Sr.No" },
      { key: "particulars", label: "Particulars" },
      { key: "amount", label: "Amount", align: "right" },
    ],
    rows: [{ srNo: "1", particulars: "", amount: "" }],
  },
};

const DOCS = [
  { name: "invoice.sales", payload: invoicePayload },
  { name: "report.stock", payload: stockPayload },
  { name: "report.dayBook (sparse)", payload: sparsePayload },
];

/*
 * Mirrors server/services/print/registry.ts. Kept as a literal so this harness
 * does not pull the mappers (and therefore the database) into the process.
 */
const ALL_DOC_KEYS = [
  "invoice.sales",
  "invoice.purchase",
  "voucher.cashReceipt",
  "voucher.cashPayment",
  "voucher.journal",
  "report.stock",
  "report.purchases",
  "report.sales",
  "report.bardana",
  "report.less",
  "report.periodPurchases",
  "report.periodSales",
  "report.grossProfit",
  "report.dayBook",
  "report.outstandingCustomers",
  "report.outstandingSuppliers",
  "report.ledger",
  "report.trialBalance",
  "statement.balanceSheet",
  "statement.incomeStatement",
  "statement.profitLoss",
  "statement.capital",
  "report.salary",
];

const FORMATS: PrintFormat[] =["A4", "A5", "Letter", "Legal", "Thermal80"];
const ORIENTATIONS: PrintOrientation[] = ["portrait", "landscape"];
const MARGINS = [0, 5, 10, 25];
const APPEARANCES: PrintAppearance[] = [
  { colorMode: "color", showLogo: true, showColoredHeaders: true },
  { colorMode: "grayscale", showLogo: false, showColoredHeaders: true },
  { colorMode: "bw", showLogo: false, showColoredHeaders: false },
];

// 1px of slack absorbs sub-pixel rounding in Chromium's layout.
const TOLERANCE_PX = 1;
const PX_PER_MM = 96 / 25.4;
const PT_PER_MM = 72 / 25.4;

async function main() {
  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  const page = await browser.newPage();
  const failures: string[] = [];
  let checks = 0;

  /** Loads `html` in both media types and reports any horizontal overflow. */
  async function assertNoOverflow(label: string, html: string, widthMm: number, marginMm: number) {
    for (const media of ["screen", "print"] as const) {
      checks += 1;
      /*
       * In print media Chromium lays the document out inside the printable box
       * (paper minus margins), so the viewport is sized to match - otherwise the
       * assertion runs at an unrelated 1280px width and misses real PDF overflow.
       */
      const viewportWidth =
        media === "print"
          ? Math.round(Math.max(widthMm - marginMm * 2, 10) * PX_PER_MM)
          : 1280;
      await page.setViewportSize({ width: viewportWidth, height: 900 });
      await page.setContent(html, { waitUntil: "load" });
      await page.emulateMedia({ media });
      const result = await page.evaluate((tolerance) => {
        const pageEl = document.querySelector(".page") as HTMLElement | null;
        if (!pageEl) return { ok: false, reason: "no .page element", offenders: [] as string[] };
        const pageRect = pageEl.getBoundingClientRect();
        const offenders: string[] = [];
        document.querySelectorAll<HTMLElement>(".doc *").forEach((el) => {
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 && rect.height === 0) return;
          if (rect.left < pageRect.left - tolerance || rect.right > pageRect.right + tolerance) {
            offenders.push(
              `${el.className || el.tagName} left=${rect.left.toFixed(1)} right=${rect.right.toFixed(1)}`,
            );
          }
        });
        return {
          ok: offenders.length === 0 && pageEl.scrollWidth <= pageEl.clientWidth + tolerance,
          reason:
            pageEl.scrollWidth > pageEl.clientWidth + tolerance
              ? `.page scrollWidth ${pageEl.scrollWidth} > clientWidth ${pageEl.clientWidth}`
              : "",
          offenders: offenders.slice(0, 4),
        };
      }, TOLERANCE_PX);

      if (!result.ok) {
        failures.push(`${label} media=${media}: ${result.reason} ${result.offenders.join(" | ")}`);
      }
    }
  }

  for (const doc of DOCS) {
    for (const format of FORMATS) {
      for (const orientation of ORIENTATIONS) {
        for (const margin of MARGINS) {
          const appearance = APPEARANCES[checks % APPEARANCES.length];
          const options = {
            format,
            orientation,
            marginTopMm: margin,
            marginRightMm: margin,
            marginBottomMm: margin,
            marginLeftMm: margin,
            appearance,
          };
          const html = renderDocumentHtml(doc.payload, options);
          const size = resolvePageSizeMm(options);

          await assertNoOverflow(
            `${doc.name} ${format}/${orientation} margin=${margin}mm (${size.width}x${size.height}mm)`,
            html,
            size.width,
            margin,
          );
        }
      }
    }
  }

  /*
   * Every doc type gets a `doc-key-*` body class, and some of them have their own
   * CSS. Run the worst-case payload under each registered key so a doc-specific
   * rule cannot reintroduce overflow on one module only.
   */
  for (const docKey of ALL_DOC_KEYS) {
    for (const format of ["A4", "Thermal80"] as PrintFormat[]) {
      const options = {
        format,
        orientation: "portrait" as PrintOrientation,
        marginTopMm: 0,
        marginRightMm: 0,
        marginBottomMm: 0,
        marginLeftMm: 0,
        appearance: APPEARANCES[0],
      };
      const html = renderDocumentHtml({ ...invoicePayload, docKey }, options);
      const size = resolvePageSizeMm(options);
      await assertNoOverflow(`${docKey} ${format}/portrait margin=0mm`, html, size.width, 0);
    }
  }

  await browser.close();

  /*
   * The HTML checks above only prove the preview is sound. This pass drives the
   * real PDF engine and reads the page geometry back out of the produced file,
   * so paper size and margins are verified in the artefact the user downloads
   * and prints.
   */
  for (const doc of [DOCS[0], DOCS[1]]) {
    for (const format of FORMATS) {
      for (const orientation of ORIENTATIONS) {
        for (const margin of [0, 10]) {
          checks += 1;
          const options = {
            format,
            orientation,
            marginTopMm: margin,
            marginRightMm: margin,
            marginBottomMm: margin,
            marginLeftMm: margin,
          };
          const html = renderDocumentHtml(doc.payload, {
            ...options,
            appearance: APPEARANCES[0],
          });
          const buffer = await renderPdf(html, options);
          const size = resolvePageSizeMm(options);
          const text = buffer.toString("latin1");
          const boxes = [...text.matchAll(/\/MediaBox\s*\[\s*([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s+([\d.\-]+)\s*\]/g)];
          const label = `${doc.name} ${format}/${orientation} margin=${margin}mm PDF`;
          if (!boxes.length) {
            failures.push(`${label}: no /MediaBox found in output (${buffer.length} bytes)`);
            continue;
          }
          const expectedW = size.width * PT_PER_MM;
          const expectedH = size.height * PT_PER_MM;
          const bad = boxes.find((m) => {
            const w = Number(m[3]) - Number(m[1]);
            const h = Number(m[4]) - Number(m[2]);
            return Math.abs(w - expectedW) > 1.5 || Math.abs(h - expectedH) > 1.5;
          });
          if (bad) {
            failures.push(
              `${label}: page box ${bad[3]}x${bad[4]}pt, expected ${expectedW.toFixed(1)}x${expectedH.toFixed(1)}pt`,
            );
          }
        }
      }
    }
  }

  if (failures.length) {
    console.error(`Print layout: ${failures.length}/${checks} checks FAILED`);
    failures.slice(0, 25).forEach((f) => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`Print layout: all ${checks} checks passed (no horizontal overflow).`);
  // The PDF engine keeps a pooled Chromium alive for the process lifetime.
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
