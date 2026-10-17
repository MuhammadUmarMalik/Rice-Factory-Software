/**
 * Guards the canonical invoice summary sequence end to end.
 *
 * The order itself lives in `services/print/mappers/invoice-summary.ts`
 * (`INVOICE_SUMMARY_ORDER`). This harness proves two things that used to drift:
 *
 *   1. the mapper emits the thirteen canonical rows in order, once each, and
 *      fills a field the source data left blank with "-" instead of dropping it;
 *   2. the shared template (`views/print/base.ts`) renders those rows in the
 *      same order into the HTML that the preview and the PDF both use - so the
 *      thing the user sees is the thing the test checks.
 *
 * Run from server/:  npx tsx scripts/test-invoice-summary-order.ts
 */
import { renderDocumentHtml } from "../views/print/base";
import {
  INVOICE_SUMMARY_ORDER,
  SALE_INVOICE_SUMMARY_ORDER,
  buildInvoiceSummary,
  buildSaleInvoiceSummary,
  findInvoiceSummaryOrderProblems,
} from "../services/print/mappers/invoice-summary";
import type { PrintableDocumentPayload } from "../types/print";

const problems: string[] = [];
function check(condition: boolean, message: string) {
  if (!condition) problems.push(message);
}

/* 1. The canonical list is internally consistent (no duplicate/typo entries). */
check(
  findInvoiceSummaryOrderProblems(INVOICE_SUMMARY_ORDER).length === 0,
  `INVOICE_SUMMARY_ORDER is not self-consistent: ${findInvoiceSummaryOrderProblems(
    INVOICE_SUMMARY_ORDER,
  ).join(", ")}`,
);

/*
 * 2. The mapper. Values are deliberately sparse so the "-" fallback and the
 *    extra-row anchoring are both exercised.
 */
const built = buildInvoiceSummary({
  lead: { label: "Customer", value: "Al-Hamd Traders", highlight: true },
  values: {
    "Invoice Date": "01 Jan 2026",
    "Total Bags": "1,200",
    "Grand Total": "Rs. 1,845,000.00",
  },
  highlight: ["Grand Total"],
  extras: [{ after: "Bardana / Kaat", label: "Total Qty", value: "48,000.00" }],
});

const labels = built.map((row) => row.label);
const orderProblems = findInvoiceSummaryOrderProblems(labels);
check(orderProblems.length === 0, `mapper summary out of order: ${orderProblems.join(", ")}`);

for (const field of INVOICE_SUMMARY_ORDER) {
  const count = labels.filter((label) => label === field).length;
  check(count === 1, `canonical field "${field}" printed ${count} times (expected once)`);
}

const blankRow = built.find((row) => row.label === "Total Weight");
check(blankRow?.value === "-", `missing value should render as "-", got ${JSON.stringify(blankRow?.value)}`);

const grandRow = built.find((row) => row.label === "Grand Total");
check(grandRow?.highlight === true, "Grand Total should be flagged for emphasis");

/* 3. The view. Render the built summary and read the label cells back in order. */
const payload: PrintableDocumentPayload = {
  docType: "INVOICE",
  docKey: "invoice.sales",
  title: "Sales Invoice",
  company: { name: "Al-Hamd Rice Mills" },
  meta: {},
  sections: built,
  table: { columns: [], rows: [] },
};

const html = await renderDocumentHtml(payload, {
  format: "A4",
  orientation: "portrait",
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  appearance: { colorMode: "color", showLogo: true, showColoredHeaders: true },
});

const renderedLabels = [...html.matchAll(/<td class="label">([^<]*)<\/td>/g)].map((m) =>
  m[1].replace(/&#039;/g, "'").replace(/&amp;/g, "&"),
);
const renderedProblems = findInvoiceSummaryOrderProblems(renderedLabels);
check(
  renderedProblems.length === 0,
  `rendered summary out of order: ${renderedProblems.join(", ")}`,
);
check(
  renderedLabels.includes("Grand Total"),
  "rendered summary is missing Grand Total",
);
const grandRowMatch = html.match(/<tr class="([^"]*)">\s*<td class="label">Grand Total<\/td>/);
check(
  Boolean(grandRowMatch) && /\bgrand\b/.test(grandRowMatch![1]),
  "Grand Total row should carry the grand class",
);
check(
  renderedLabels[0] === "Customer",
  `party lead row should print first, got ${JSON.stringify(renderedLabels[0])}`,
);

/* 4. The sales invoice's own sequence, rendered through the same template. */
const saleSections = buildSaleInvoiceSummary({ Customer: "Al-Hamd Traders", "Grand Total": "Rs. 10.00" });
const saleHtml = await renderDocumentHtml(
  { ...payload, sections: saleSections },
  { format: "A4", orientation: "portrait", marginTopMm: 10, marginRightMm: 10, marginBottomMm: 10, marginLeftMm: 10,
    appearance: { colorMode: "color", showLogo: true, showColoredHeaders: true } },
);
const saleRendered = [...saleHtml.matchAll(/<td class="label">([^<]*)<\/td>/g)].map((m) => m[1]);
check(
  JSON.stringify(saleRendered) === JSON.stringify(SALE_INVOICE_SUMMARY_ORDER),
  `sale summary must print exactly ${SALE_INVOICE_SUMMARY_ORDER.join(" > ")}; got ${saleRendered.join(" > ")}`,
);
check(saleSections.find((r) => r.label === "Total Bag")?.value === "-", "empty sale field should print \"-\"");

if (problems.length) {
  console.error(`invoice summary order: ${problems.length} problem(s)`);
  problems.forEach((p) => console.error(`  - ${p}`));
  process.exit(1);
}
console.log("invoice summary order: OK");
process.exit(0);
