import type { PrintAppearance, PrintColorMode } from "../../services/print/types";

export const printStyles = `
  :root {
    --ink: #0b0f19;
    --muted: #1f2937;
    --border: #374151;
    --border-strong: #111827;
    --accent: #111827;
    --bg: #ffffff;
    --soft: #f1f5f9;
    --soft-strong: #e5e7eb;
    --party-bg: #e0f2fe;
    --totals-bg: #e5e7eb;
    --page-width: 210mm;
    --page-height: 297mm;
    --page-margin-top: 10mm;
    --page-margin-right: 10mm;
    --page-margin-bottom: 10mm;
    --page-margin-left: 10mm;
    --preview-bg: #ffffff;
  }

  @page {
    size: var(--page-width) var(--page-height);
    margin: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
  }

  /*
   * border-box is load-bearing: .page is sized to the physical paper width and
   * .doc reproduces the page margins as padding. With the browser default
   * (content-box) the padding is added *outside* the declared width, so every
   * document overflowed its page by exactly (left + right) margin - which is
   * what clipped the first column and the left edge of the header.
   */
  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    font-family: "Cambria", "Times New Roman", serif;
    color: var(--ink);
    background: var(--bg);
    margin: 0;
    padding: 0;
    font-size: 13.5px;
    line-height: 1.5;
    scrollbar-width: none;
    -ms-overflow-style: none;
  }

  body::-webkit-scrollbar {
    width: 0;
    height: 0;
  }

  .page {
    position: relative;
    box-sizing: border-box;
    width: var(--page-width);
    max-width: 100%;
    min-height: var(--page-height);
    margin: 0 auto;
    background: var(--bg);
    overflow: hidden;
  }

  .doc {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-height: 100%;
    padding: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
  }

  /* Nothing inside a document may establish a width wider than the page. */
  .doc * {
    max-width: 100%;
  }

  .header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    gap: 12px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
    margin-bottom: 8px;
  }

  .brand {
    display: flex;
    gap: 12px;
    align-items: center;
    min-width: 0;
  }

  .brand > div {
    min-width: 0;
  }

  .brand-logo {
    width: 48px;
    height: 48px;
    flex: 0 0 auto;
    border-radius: 6px;
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .brand-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.2px;
    overflow-wrap: anywhere;
  }

  .brand-meta {
    font-size: 11px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .doc-title {
    text-align: right;
    min-width: 0;
  }

  .doc-title h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    overflow-wrap: anywhere;
  }

  .doc-title .doc-no {
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    font-size: 12.5px;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .meta-chip {
    background: var(--soft);
    border: 1px solid var(--border);
    padding: 4px 10px;
    border-radius: 999px;
    /* Long customer / gate-pass values must wrap instead of pushing the row wide. */
    white-space: normal;
    overflow-wrap: anywhere;
    max-width: 100%;
  }

  .meta-chip.party-chip {
    background: var(--party-bg);
    border: 2px solid var(--accent);
    color: var(--ink);
    font-size: 13px;
    font-weight: 700;
  }

  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .doc-key-invoice-purchase .sections,
  .doc-key-invoice-sales .sections {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .doc-key-report-stock table {
    table-layout: fixed;
  }

  .doc-key-report-stock thead th,
  .doc-key-report-stock tbody td {
    font-size: 10px;
    padding: 5px 4px;
    line-height: 1.3;
  }

  .section-card {
    border: 1px solid var(--border);
    background: var(--soft);
    padding: 8px 10px;
    border-radius: 8px;
    min-width: 0;
  }

  .section-card .label {
    text-transform: uppercase;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.3px;
    overflow-wrap: anywhere;
  }

  .section-card .value {
    font-size: 14px;
    font-weight: 700;
    overflow-wrap: anywhere;
  }

  .section-card.party {
    border: 2px solid var(--accent);
    background: var(--party-bg);
  }

  .section-card.party .value {
    font-size: 16px;
    font-weight: 800;
  }

  .summary-table {
    margin: 8px 0 10px;
  }

  .summary-title {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 4px;
  }

  .summary-table table {
    table-layout: auto;
    margin-bottom: 0;
    border: 1px solid var(--border-strong);
  }

  .summary-table td {
    border: none;
    padding: 3px 6px;
    font-size: 12.5px;
  }

  .summary-table tr + tr td {
    border-top: 1px solid var(--border);
  }

  .summary-table td.label {
    color: var(--ink);
    overflow-wrap: anywhere;
  }

  .summary-table td.value {
    font-family: "Courier New", monospace;
    font-weight: 700;
    color: var(--ink);
    text-align: right;
    overflow-wrap: anywhere;
  }

  .summary-table tr.highlight td.value {
    font-size: 13.5px;
  }

  table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    margin-bottom: 8px;
    table-layout: fixed;
  }

  thead th {
    background: var(--soft-strong);
    border: 1px solid var(--border);
    padding: 7px 6px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    vertical-align: middle;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  thead {
    display: table-header-group;
  }

  tbody td {
    border: 1px solid var(--border);
    padding: 7px 6px;
    vertical-align: top;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  tbody tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /*
   * Right-aligned cells used to be "white-space: nowrap", which combined with
   * table-layout: fixed pushed long money values past the page edge. Wrapping at
   * the space inside "Rs. 1,234,567.00" is the lesser evil - it never overflows.
   */
  .align-right {
    text-align: right;
  }

  .align-center {
    text-align: center;
  }

  .group-row td {
    background: var(--soft-strong);
    font-weight: 700;
    text-transform: uppercase;
    font-size: 11px;
  }

  .totals-row td {
    font-weight: 700;
    background: var(--totals-bg);
  }

  .notes {
    border: 1px dashed var(--border);
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--soft);
    margin-bottom: 8px;
    overflow-wrap: anywhere;
  }

  .signatures {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 18px;
    margin-top: 12px;
  }

  .signature {
    border-top: 1px solid var(--border);
    padding-top: 6px;
    font-size: 11px;
    text-align: center;
    color: var(--muted);
    overflow-wrap: anywhere;
  }

  .footer {
    position: absolute;
    bottom: var(--page-margin-bottom);
    left: var(--page-margin-left);
    right: var(--page-margin-right);
    font-size: 10px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }

  /* The rotation lives on the inner span, not on this box. Rotating the box
     itself grew its border box past the page edge and widened the page's
     scrollable area (a horizontal overflow on every watermarked document). */
  .watermark {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    pointer-events: none;
    z-index: 0;
    overflow: hidden;
  }

  .watermark-text {
    font-size: 72px;
    opacity: 0.05;
    color: var(--ink);
    white-space: nowrap;
    transform: rotate(-20deg);
  }

  .page-break {
    page-break-after: always;
    break-after: page;
  }

  .no-break,
  .no-break * {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  /* Narrow receipt roll: single column, compact type, no decorative chrome. */
  .paper-thermal80 {
    font-size: 11px;
  }

  .paper-thermal80 .header {
    display: block;
    text-align: center;
  }

  .paper-thermal80 .brand {
    display: block;
    text-align: center;
  }

  .paper-thermal80 .brand-logo {
    margin: 0 auto 4px;
    width: 36px;
    height: 36px;
  }

  .paper-thermal80 .brand-title {
    font-size: 14px;
  }

  .paper-thermal80 .doc-title {
    text-align: center;
    margin-top: 4px;
  }

  .paper-thermal80 .doc-title h1 {
    font-size: 12px;
  }

  .paper-thermal80 .meta {
    display: block;
    font-size: 10px;
  }

  .paper-thermal80 .meta-chip {
    display: block;
    border: none;
    border-radius: 0;
    background: none;
    padding: 1px 0;
    font-weight: 400;
    font-size: 10px;
  }

  .paper-thermal80 .meta-chip.party-chip {
    border: none;
    font-size: 10px;
  }

  /* Both classes sit on <body>, so these must be compound selectors, not descendant ones. */
  .paper-thermal80 .sections,
  .paper-thermal80.doc-key-invoice-sales .sections,
  .paper-thermal80.doc-key-invoice-purchase .sections {
    display: block;
  }

  .paper-thermal80 .section-card {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    border: none;
    border-bottom: 1px dotted var(--border);
    border-radius: 0;
    background: none;
    padding: 2px 0;
  }

  .paper-thermal80 .section-card.party {
    border: none;
    border-bottom: 1px solid var(--border);
    background: none;
  }

  .paper-thermal80 .section-card .value,
  .paper-thermal80 .section-card.party .value {
    font-size: 11px;
  }

  .paper-thermal80 thead th,
  .paper-thermal80 tbody td,
  .paper-thermal80 .summary-table td {
    font-size: 9.5px;
    padding: 3px 2px;
  }

  .paper-thermal80 .signatures {
    display: none;
  }

  .paper-thermal80 .footer {
    position: static;
    display: block;
    text-align: center;
    margin-top: 8px;
  }

  @media print {
    /*
     * In print/PDF the physical page box already carries the margins (@page, or
     * the equivalent option passed to the PDF engine). The .page element must
     * therefore collapse to the printable content box instead of staying pinned
     * at the full paper width, otherwise it overhangs the margin box and the
     * outer edges get clipped.
     */
    .page {
      width: auto;
      max-width: none;
      min-height: 0;
      margin: 0;
      overflow: visible;
      transform: none;
      box-shadow: none;
      border: none;
    }

    .doc {
      padding: 0;
      min-height: 0;
    }

    /* Repeated per physical page by the PDF engine's own footer template. */
    .footer {
      display: none;
    }

    .watermark {
      position: fixed;
    }
  }

  @media screen {
    body {
      background: var(--preview-bg);
    }

    .page {
      margin: 0 auto;
    }
  }
`;

const COLOR_TOKENS: Record<PrintColorMode, string> = {
  color: "",
  grayscale: `
    --ink: #111111;
    --muted: #3d3d3d;
    --border: #4a4a4a;
    --border-strong: #111111;
    --accent: #111111;
    --soft: #f2f2f2;
    --soft-strong: #dedede;
    --party-bg: #ededed;
    --totals-bg: #dedede;
  `,
  bw: `
    --ink: #000000;
    --muted: #000000;
    --border: #000000;
    --border-strong: #000000;
    --accent: #000000;
    --soft: #ffffff;
    --soft-strong: #ffffff;
    --party-bg: #ffffff;
    --totals-bg: #ffffff;
  `,
};

/**
 * Appearance overrides layered on top of `printStyles`. Implemented as CSS
 * custom-property overrides rather than a blanket `filter`, so that the same
 * rules survive Chrome's print pipeline, Playwright's PDF renderer and
 * Electron's printToPDF identically.
 */
export function buildAppearanceStyles(appearance: PrintAppearance) {
  const tokens = COLOR_TOKENS[appearance.colorMode] || "";
  const flatHeaders = !appearance.showColoredHeaders
    ? `
      /* Pre-printed letterhead: no tinted fills anywhere on the page. */
      :root {
        --soft: #ffffff;
        --soft-strong: #ffffff;
        --party-bg: #ffffff;
        --totals-bg: #ffffff;
      }
      .meta-chip,
      .section-card,
      .notes,
      thead th,
      .group-row td,
      .totals-row td {
        background: #ffffff;
      }
    `
    : "";
  const imageTreatment =
    appearance.colorMode === "color"
      ? ""
      : appearance.colorMode === "grayscale"
        ? `img { filter: grayscale(100%); }`
        : `img { filter: grayscale(100%) contrast(180%); }`;

  return `
    ${tokens ? `:root {${tokens}}` : ""}
    ${flatHeaders}
    ${imageTreatment}
  `;
}
