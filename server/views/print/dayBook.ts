import { format } from "date-fns";
import type { PrintableDocumentPayload, PrintableTableColumn } from "../../types/print";
import type { PrintFormat, PrintOrientation } from "../../services/print/types";
import { printStyles } from "./styles";

function escapeHtml(value: unknown) {
  const text = String(value ?? "");
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function alignClass(col: PrintableTableColumn) {
  if (col.align === "right") return "align-right";
  if (col.align === "center") return "align-center";
  return "";
}

function isPartyLabel(label: string) {
  const normalized = label.trim().toLowerCase();
  return ["party", "customer", "supplier", "account"].includes(normalized);
}

function renderMeta(payload: PrintableDocumentPayload) {
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

function formatPrintedDate(value?: string) {
  if (!value) return "";
  try {
    return format(new Date(value), "dd-MM-yyyy hh:mm a");
  } catch {
    return "";
  }
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

export function renderDayBookHtml(payload: PrintableDocumentPayload, options: PrintPageOptions) {
  const meta = payload.meta;
  const dateFrom = meta?.dateFrom || "";
  const dateTo = meta?.dateTo || "";
  const rangeLabel = dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} - ${dateTo}` : dateFrom || dateTo;

  const table = payload.table;
  const header = table
    ? `
      <thead>
        <tr>
          ${table.columns
            .map((c) => `<th class="${alignClass(c)}" style="${c.width ? `width:${c.width};` : ""}">${escapeHtml(c.label)}</th>`)
            .join("")}
        </tr>
      </thead>
    `
    : "";

  const rows = table
    ? table.rows
        .map((row: Record<string, any>) => {
          const isTotal = Boolean(row.__groupTotal);
          return `
            <tr class="${isTotal ? "totals-row" : ""}">
              ${table.columns
                .map((c) => {
                  const val = row[c.key];
                  const escaped = escapeHtml(val ?? "");
                  const htmlVal = escaped.replace(/\\n/g, "<br/>");
                  return `<td class="${alignClass(c)}">${htmlVal}</td>`;
                })
                .join("")}
            </tr>
          `;
        })
        .join("")
    : "";

  const totalsRow =
    table?.totalsRow
      ? `
        <tr class="totals-row">
          ${table.columns
            .map((c) => `<td class="${alignClass(c)}">${escapeHtml(table.totalsRow?.[c.key] ?? "")}</td>`)
            .join("")}
        </tr>
      `
      : "";
  const pageSize = resolvePageSize(options);
  const watermark = payload.settings?.showWatermark
    ? `<div class="watermark">${escapeHtml(payload.settings?.watermarkText || payload.company.name)}</div>`
    : "";

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(payload.title)}</title>
    <style>
      ${printStyles}
      :root {
        --page-width: ${pageSize.widthMm};
        --page-height: ${pageSize.heightMm};
        --page-margin-top: ${options.marginTopMm}mm;
        --page-margin-right: ${options.marginRightMm}mm;
        --page-margin-bottom: ${options.marginBottomMm}mm;
        --page-margin-left: ${options.marginLeftMm}mm;
      }
    </style>
  </head>
  <body>
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
            <h1>DAY BOOK${rangeLabel ? ` (${escapeHtml(rangeLabel)})` : ""}</h1>
            <div class="doc-no">Printing Date: ${escapeHtml(formatPrintedDate(meta?.createdAt))}</div>
          </div>
        </div>
        ${renderMeta(payload)}
        ${table ? `<table>${header}<tbody>${rows}${totalsRow}</tbody></table>` : ""}
      </div>
      <div class="footer">
        <div>Generated by Rice Mill ERP</div>
        <div>Page <span class="pageNumber"></span></div>
      </div>
    </div>
  </body>
</html>
`;
}
