import { format } from "date-fns";
import type { PrintableDocumentPayload, PrintableTableColumn } from "@shared/print";
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

export function renderDayBookHtml(payload: PrintableDocumentPayload) {
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

  return `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${escapeHtml(payload.title)}</title>
    <style>${dayBookStyles}</style>
  </head>
  <body>
    <div class="doc">
      <div class="company-line">${escapeHtml(companyLine)}${escapeHtml(phoneSuffix)}</div>
      <div class="title-bar">DAY BOOK${rangeLabel ? ` (${escapeHtml(rangeLabel)})` : ""}</div>
      <div class="print-line">Printing Date: ${escapeHtml(formatPrintedDate(meta?.createdAt))}</div>
      ${table ? `<table>${header}<tbody>${rows}${totalsRow}</tbody></table>` : ""}
    </div>
  </body>
</html>
`;
}
