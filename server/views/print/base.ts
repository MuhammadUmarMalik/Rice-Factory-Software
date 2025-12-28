import type { PrintableDocumentPayload, PrintableTableColumn } from "@shared/print";
import type { PrintFormat, PrintOrientation } from "../../services/print/types";
import { printStyles } from "./styles";
import { renderDayBookHtml } from "./dayBook";

function escapeHtml(value: unknown) {
  const text = String(value ?? "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

type PrintPageOptions = {
  format: PrintFormat;
  orientation: PrintOrientation;
  widthMm?: number;
  heightMm?: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
};

function resolvePageSize(options: PrintPageOptions) {
  const formats: Record<Exclude<PrintFormat, "Custom">, { width: number; height: number }> = {
    A4: { width: 210, height: 297 },
    A5: { width: 148, height: 210 },
    Letter: { width: 216, height: 279 },
    Legal: { width: 216, height: 356 },
  };
  const base = options.format === "Custom"
    ? { width: options.widthMm || 210, height: options.heightMm || 297 }
    : formats[options.format];
  const width = options.orientation === "landscape" ? base.height : base.width;
  const height = options.orientation === "landscape" ? base.width : base.height;
  return { widthMm: `${width}mm`, heightMm: `${height}mm` };
}

function renderMeta(payload: PrintableDocumentPayload) {
  const meta = payload.meta;
  if (!meta) return "";
  const chips: string[] = [];
  if (meta.dateFrom || meta.dateTo) {
    chips.push(`Period: ${escapeHtml(meta.dateFrom || "-")} - ${escapeHtml(meta.dateTo || "-")}`);
  }
  if (meta.createdBy) chips.push(`Prepared By: ${escapeHtml(meta.createdBy)}`);
  if (meta.createdAt) chips.push(`Prepared At: ${escapeHtml(meta.createdAt)}`);
  if (meta.filters) {
    for (const [key, val] of Object.entries(meta.filters)) {
      chips.push(`${escapeHtml(key)}: ${escapeHtml(val)}`);
    }
  }
  if (chips.length === 0) return "";
  return `
    <div class="meta">
      ${chips.map((chip) => `<div class="meta-chip">${chip}</div>`).join("")}
    </div>
  `;
}

function renderSections(payload: PrintableDocumentPayload) {
  if (!payload.sections || payload.sections.length === 0) return "";
  return `
    <div class="sections">
      ${payload.sections
        .map(
          (s) => `
        <div class="section-card${s.highlight ? " highlight" : ""}">
          <div class="label">${escapeHtml(s.label)}</div>
          <div class="value">${escapeHtml(s.value)}</div>
        </div>
      `,
        )
        .join("")}
    </div>
  `;
}

function alignClass(col: PrintableTableColumn) {
  if (col.align === "right") return "align-right";
  if (col.align === "center") return "align-center";
  return "";
}

function renderTable(payload: PrintableDocumentPayload) {
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

function renderSignatures(payload: PrintableDocumentPayload) {
  if (payload.docKey !== "voucher.journal") return "";
  const signatures = payload.signatures || [
    { label: "Prepared By" },
    { label: "Approved By" },
    { label: "Received By" },
  ];
  return `
    <div class="signatures">
      ${signatures.map((s) => `<div class="signature">${escapeHtml(s.label)}</div>`).join("")}
    </div>
  `;
}

export function renderDocumentHtml(payload: PrintableDocumentPayload, options: PrintPageOptions) {
  if (payload.docKey === "report.dayBook") {
    return renderDayBookHtml(payload, options);
  }
  const docKeyClass = `doc-key-${String(payload.docKey).replace(/[^a-z0-9]+/gi, "-").toLowerCase()}`;
  const watermark = payload.settings?.showWatermark
    ? `<div class="watermark">${escapeHtml(payload.settings?.watermarkText || payload.company.name)}</div>`
    : "";
  const pageSize = resolvePageSize(options);

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(payload.title)}</title>
    <style>
      :root {
        --page-width: ${pageSize.widthMm};
        --page-height: ${pageSize.heightMm};
        --page-margin-top: ${options.marginTopMm}mm;
        --page-margin-right: ${options.marginRightMm}mm;
        --page-margin-bottom: ${options.marginBottomMm}mm;
        --page-margin-left: ${options.marginLeftMm}mm;
      }
      ${printStyles}
    </style>
  </head>
  <body class="${docKeyClass}">
    ${watermark}
    <div class="page">
      <div class="doc">
        <div class="header">
          <div class="brand">
            ${payload.company.logoUrl ? `<img class="brand-logo" src="${escapeHtml(payload.company.logoUrl)}" alt="logo" />` : ""}
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
          <div class="doc-title">
            <h1>${escapeHtml(payload.title)}</h1>
            ${payload.docNo ? `<div class="doc-no">Document No: ${escapeHtml(payload.docNo)}</div>` : ""}
          </div>
        </div>
        ${renderMeta(payload)}
        ${renderSections(payload)}
        ${renderTable(payload)}
        ${renderNotes(payload)}
        ${renderSignatures(payload)}
      </div>
      <div class="footer">
        <div>Generated by Rice Mill ERP</div>
        <div>Page <span class="pageNumber"></span></div>
      </div>
    </div>
    <script>
      (function () {
        const page = document.querySelector(".pageNumber");
        if (page) page.textContent = (window.pageNumber || "") ? window.pageNumber : "";
      })();
    </script>
  </body>
</html>
`;
}
