import QRCode from "qrcode";
import type { PrintableDocumentPayload, PrintableTableColumn } from "../../types/print";
import type { PrintAppearance, PrintFormat, PrintOrientation } from "../../services/print/types";
import { resolvePageSizeMm } from "../../services/print/types";
import { buildAppearanceStyles, printStyles } from "./styles";
import { renderDayBookContent } from "./dayBook";
import { INVOICE_SUMMARY_ORDER } from "../../services/print/mappers/invoice-summary";

/*
 * The summary row that carries the grand total is named by the same constant
 * that owns the canonical invoice sequence, so the emphasis style and the
 * ordering can never drift apart. It is just a string constant - the module
 * has no database imports - so the view stays free of the mappers' runtime.
 */
const GRAND_TOTAL_LABEL: string = INVOICE_SUMMARY_ORDER[INVOICE_SUMMARY_ORDER.length - 1];

export function escapeHtml(value: unknown) {
  const text = String(value ?? "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export type PrintPageOptions = {
  format: PrintFormat;
  orientation: PrintOrientation;
  widthMm?: number;
  heightMm?: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  appearance: PrintAppearance;
};

export function isPartyLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return ["party", "customer", "supplier", "account"].includes(normalized);
}

export function alignClass(col: PrintableTableColumn) {
  if (col.align === "right") return "align-right";
  if (col.align === "center") return "align-center";
  return "";
}

export function renderMeta(payload: PrintableDocumentPayload) {
  const meta = payload.meta;
  if (!meta) return "";
  const chips: Array<{ text: string; className?: string }> = [];
  if (meta.dateFrom || meta.dateTo) {
    chips.push({
      text: `Period: ${escapeHtml(meta.dateFrom || "-")} - ${escapeHtml(meta.dateTo || "-")}`,
    });
  }
  if (meta.createdBy) chips.push({ text: `Prepared By: ${escapeHtml(meta.createdBy)}` });
  if (meta.createdAt) chips.push({ text: `Prepared At: ${escapeHtml(meta.createdAt)}` });
  if (meta.filters) {
    for (const [key, val] of Object.entries(meta.filters)) {
      const isParty = isPartyLabel(key);
      chips.push({
        text: `${escapeHtml(key)}: ${escapeHtml(val)}`,
        className: isParty ? "party-chip" : undefined,
      });
    }
  }
  if (chips.length === 0) return "";
  return `
    <div class="meta">
      ${chips
        .map(
          (chip) =>
            `<div class="meta-chip${chip.className ? ` ${chip.className}` : ""}">${chip.text}</div>`,
        )
        .join("")}
    </div>
  `;
}

export function renderBrand(payload: PrintableDocumentPayload, appearance: PrintAppearance) {
  const logo =
    appearance.showLogo && payload.company.logoUrl
      ? `<img class="brand-logo" src="${escapeHtml(payload.company.logoUrl)}" alt="logo" />`
      : "";
  /*
   * The header always prints the business name in English. The Urdu variant is
   * intentionally omitted so the document title stays in one language and the
   * letterhead reads the same on every printout.
   */
  return `
    <div class="brand">
      ${logo}
      <div>
        <div class="brand-title">${escapeHtml(payload.company.name)}</div>
        <div class="brand-meta">
          ${payload.company.address ? `${escapeHtml(payload.company.address)}<br/>` : ""}
          ${payload.company.phone ? `Phone: ${escapeHtml(payload.company.phone)}` : ""}
          ${payload.company.ntn ? ` | NTN: ${escapeHtml(payload.company.ntn)}` : ""}
          ${payload.company.strn ? ` | STRN: ${escapeHtml(payload.company.strn)}` : ""}
        </div>
      </div>
    </div>
  `;
}

export function docKeyClass(docKey: unknown) {
  return `doc-key-${String(docKey).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
}

/*
 * The verification QR lives in the document header, in the top-right corner,
 * for every document type. It is the same shared component the day book and the
 * generic shell use, so it can only ever appear in one place.
 */
export function renderHeaderQr(qrDataUrl: string) {
  if (!qrDataUrl) return "";
  return `<div class="header-qr"><img src="${qrDataUrl}" alt="QR" /></div>`;
}

/**
 * The single page shell shared by every printable document. Paper size, margins
 * and appearance are applied here and nowhere else, so a layout fix lands on all
 * modules at once.
 */
export function renderPageShell(options: {
  payload: PrintableDocumentPayload;
  page: PrintPageOptions;
  bodyClass?: string;
  content: string;
}) {
  const { payload, page, content } = options;
  const size = resolvePageSizeMm(page);
  const appearance = page.appearance;
  const printableWidthMm = size.width - page.marginLeftMm - page.marginRightMm;
  const watermark = payload.settings?.showWatermark
    ? `<div class="watermark"><span class="watermark-text">${escapeHtml(
        payload.settings?.watermarkText || payload.company.name,
      )}</span></div>`
    : "";
  const bodyClasses = [
    docKeyClass(payload.docKey),
    `paper-${String(page.format).toLowerCase()}`,
    `color-${appearance.colorMode}`,
    // Printable width under 200mm (portrait A4/Letter): wide reports switch to
    // compact sizing; under 110mm their headers may also break mid-word.
    printableWidthMm < 200 ? "page-narrow" : "",
    printableWidthMm < 110 ? "page-tiny" : "",
    options.bodyClass || "",
  ]
    .filter(Boolean)
    .join(" ");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(payload.title)}</title>
    <style>
      ${printStyles}
      /*
       * Literal values, not var(): a custom property has no element to resolve
       * against inside @page, so Chromium ignores the whole descriptor and
       * falls back to the browser's default paper.
       */
      @page {
        size: ${size.width}mm ${size.height}mm;
        margin: ${page.marginTopMm}mm ${page.marginRightMm}mm ${page.marginBottomMm}mm ${page.marginLeftMm}mm;
      }
      :root {
        --page-width: ${size.width}mm;
        --page-height: ${size.height}mm;
        --page-margin-top: ${page.marginTopMm}mm;
        --page-margin-right: ${page.marginRightMm}mm;
        --page-margin-bottom: ${page.marginBottomMm}mm;
        --page-margin-left: ${page.marginLeftMm}mm;
      }
      ${buildAppearanceStyles(appearance)}
    </style>
  </head>
  <body class="${bodyClasses}">
    <div class="page">
      ${watermark}
      <div class="doc">
        ${content}
      </div>
    </div>
  </body>
</html>
`;
}

/**
 * One summary component for every printable document.
 *
 * Rows are emitted in the exact order the mapper produced them, which for an
 * invoice is `INVOICE_SUMMARY_ORDER` (see mappers/invoice-summary.ts). The view
 * never reorders, renames or drops a row: a field the mapper left empty prints
 * as "-" so two invoices of the same type always read the same length. The row
 * named by `GRAND_TOTAL_LABEL` gets the emphasis treatment.
 */
function renderSummary(payload: PrintableDocumentPayload) {
  if (!payload.sections || payload.sections.length === 0) return "";
  return `
    <div class="summary-table">
      <div class="summary-title">Summary</div>
      <table>
        <tbody>
          ${payload.sections
            .map((s) => {
              const value = String(s.value ?? "").trim() ? String(s.value) : "-";
              const classes = [
                s.highlight ? "highlight" : "",
                s.label === GRAND_TOTAL_LABEL ? "grand" : "",
              ]
                .filter(Boolean)
                .join(" ");
              return `
            <tr${classes ? ` class="${classes}"` : ""}>
              <td class="label">${escapeHtml(s.label)}</td>
              <td class="value align-right">${escapeHtml(value)}</td>
            </tr>
          `;
            })
            .join("")}
        </tbody>
      </table>
    </div>
  `;
}

export function renderTable(payload: PrintableDocumentPayload) {
  const table = payload.table;
  if (!table) return "";

  const header = `
    <thead>
      <tr>
        ${table.columns
          .map((c) => `<th class="${alignClass(c)}" style="${c.width ? `width:${c.width};` : ""}">${escapeHtml(c.label)}</th>`)
          .join("")}
      </tr>
    </thead>
  `;

  const rows = table.rows
    .map((row) => {
      const group = row.__group as string | undefined;
      const isGroupTotal = Boolean(row.__groupTotal);
      if (group) {
        return `<tr class="group-row"><td colspan="${table.columns.length}">${escapeHtml(group)}</td></tr>`;
      }
      return `
        <tr class="${isGroupTotal ? "totals-row" : ""}">
          ${table.columns
            .map((c) => {
              const val = row[c.key];
              const escaped = escapeHtml(val ?? "");
              const htmlVal = escaped.replace(/\n/g, "<br/>");
              return `<td class="${alignClass(c)}">${htmlVal}</td>`;
            })
            .join("")}
        </tr>
      `;
    })
    .join("");

  const totals = table.totalsRow
    ? `
      <tr class="totals-row">
        ${table.columns
          .map((c) => `<td class="${alignClass(c)}">${escapeHtml(table.totalsRow?.[c.key] ?? "")}</td>`)
          .join("")}
      </tr>
    `
    : "";

  return `
    <table>
      ${header}
      <tbody>
        ${rows}
        ${totals}
      </tbody>
    </table>
  `;
}

function renderNotes(payload: PrintableDocumentPayload) {
  if (!payload.notes) return "";
  return `<div class="notes"><strong>Notes:</strong> ${escapeHtml(payload.notes)}</div>`;
}

async function renderQrDataUrl(payload: PrintableDocumentPayload): Promise<string> {
  const data = [payload.docKey, payload.docNo || "", payload.company.name].filter(Boolean).join("|");
  try {
    return await QRCode.toDataURL(data, { width: 128, margin: 0, errorCorrectionLevel: "M" });
  } catch {
    return "";
  }
}

function renderVerificationBlock(payload: PrintableDocumentPayload) {
  const signatures = payload.signatures || [
    { label: "Prepared By" },
    { label: "Approved By" },
    { label: "Received By" },
  ];
  const companyName = payload.company.name || "Company";
  // The signature line under "Prepared By" carries the same person as the
  // Prepared By chip - the user's full name - rather than staying blank or
  // falling back to a login username.
  const preparedByName = payload.meta?.createdBy;

  return `
    <div class="verification-block no-break">
      <div class="verification-row">
        <div class="verification-prepared">
          <div class="verification-role">Prepared &amp; Verified By</div>
          <div class="verification-dept">Accounts &amp; Finance Department</div>
        </div>
        ${signatures.map((s) => {
          const name = s.name || (s.label?.trim().toLowerCase() === "prepared by" ? preparedByName : "");
          return `
          <div class="verification-sig">
            <div class="verification-sig-label">${escapeHtml(s.label)}</div>
            ${name ? `<div class="verification-sig-name">${escapeHtml(name)}</div>` : ""}
          </div>
        `;
        }).join("")}
      </div>
      <div class="verification-note">
        <strong>Note:</strong> This is a system generated statement of accounts. If any discrepancy is noted, please report within 7 days of receipt to ${escapeHtml(companyName)} office.
      </div>
    </div>
  `;
}

export async function renderDocumentHtml(payload: PrintableDocumentPayload, options: PrintPageOptions) {
  const qrDataUrl = await renderQrDataUrl(payload);

  if (payload.docKey === "report.dayBook") {
    const dayBook = renderDayBookContent(payload, options.appearance, {
      escapeHtml,
      renderBrand,
      renderMeta,
      renderTable,
      renderHeaderQr,
      qrDataUrl,
    });
    return renderPageShell({
      payload,
      page: options,
      content: `${dayBook}${renderVerificationBlock(payload)}`,
    });
  }

  const content = `
    <div class="header">
      ${renderBrand(payload, options.appearance)}
      <div class="header-right">
        <div class="doc-title">
          <h1>${escapeHtml(payload.title)}</h1>
          ${payload.docNo ? `<div class="doc-no">Document No: ${escapeHtml(payload.docNo)}</div>` : ""}
        </div>
        ${renderHeaderQr(qrDataUrl)}
      </div>
    </div>
    ${renderMeta(payload)}
    ${renderSummary(payload)}
    ${renderTable(payload)}
    ${renderNotes(payload)}
    ${renderVerificationBlock(payload)}
  `;

  return renderPageShell({ payload, page: options, content });
}
