import { format } from "date-fns";
import type { PrintableDocumentPayload } from "../../types/print";
import type { PrintAppearance } from "../../services/print/types";

/*
 * The Day Book only differs from the generic document in its header block (it
 * shows a date range and a printing timestamp instead of a document number).
 * Everything else - page shell, paper size, margins, colour mode, footer - comes
 * from the shared shell in `base.ts`, so layout fixes apply here too.
 */

function formatPrintedDate(value?: string) {
  if (!value) return "";
  try {
    return format(new Date(value), "dd-MM-yyyy hh:mm a");
  } catch {
    return "";
  }
}

export function renderDayBookContent(
  payload: PrintableDocumentPayload,
  appearance: PrintAppearance,
  helpers: {
    escapeHtml: (value: unknown) => string;
    renderBrand: (payload: PrintableDocumentPayload, appearance: PrintAppearance) => string;
    renderMeta: (payload: PrintableDocumentPayload) => string;
    renderTable: (payload: PrintableDocumentPayload) => string;
    renderHeaderQr: (qrDataUrl: string) => string;
    qrDataUrl: string;
  },
) {
  const { escapeHtml, renderBrand, renderMeta, renderTable, renderHeaderQr, qrDataUrl } = helpers;
  const meta = payload.meta;
  const dateFrom = meta?.dateFrom || "";
  const dateTo = meta?.dateTo || "";
  const rangeLabel =
    dateFrom && dateTo && dateFrom !== dateTo ? `${dateFrom} - ${dateTo}` : dateFrom || dateTo;
  const printedAt = formatPrintedDate(meta?.createdAt);
  /* The title already carries the range, so the Period chip would repeat it. */

  return `
    <div class="header">
      ${renderBrand(payload, appearance)}
      <div class="header-right">
        <div class="doc-title">
          <h1>DAY BOOK${rangeLabel ? ` (${escapeHtml(rangeLabel)})` : ""}</h1>
          ${printedAt ? `<div class="doc-no">Printing Date: ${escapeHtml(printedAt)}</div>` : ""}
        </div>
        ${renderHeaderQr(qrDataUrl)}
      </div>
    </div>
    ${renderMeta(rangeLabel ? { ...payload, meta: { ...meta, dateFrom: undefined, dateTo: undefined } } : payload)}
    ${renderTable(payload)}
  `;
}
