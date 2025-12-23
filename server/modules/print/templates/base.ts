import type { PrintableDocumentPayload, PrintableTableColumn } from "@shared/print";
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

export function renderDocumentHtml(payload: PrintableDocumentPayload) {
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
    <style>${printStyles}</style>
  </head>
  <body>
    ${watermark}
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
