import { format } from "date-fns";
import type { PrintableDocumentPayload, PrintableTableColumn } from "@shared/print";
import type { PrintFormat, PrintOrientation } from "../../services/print/types";
import { dayBookStyles } from "./styles";

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

  const companyLine = [
    payload.company.name,
    payload.company.address,
  ]
    .filter(Boolean)
    .join(", ");
  const phoneSuffix = payload.company.phone ? ` (Mob: ${payload.company.phone})` : "";

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
      ${dayBookStyles}
    </style>
  </head>
  <body>
    <div class="page">
      <div class="doc">
        <div class="company-line">${escapeHtml(companyLine)}${escapeHtml(phoneSuffix)}</div>
        <div class="title-bar">DAY BOOK${rangeLabel ? ` (${escapeHtml(rangeLabel)})` : ""}</div>
        <div class="print-line">Printing Date: ${escapeHtml(formatPrintedDate(meta?.createdAt))}</div>
        ${table ? `<table>${header}<tbody>${rows}${totalsRow}</tbody></table>` : ""}
      </div>
    </div>
  </body>
</html>
`;
}
