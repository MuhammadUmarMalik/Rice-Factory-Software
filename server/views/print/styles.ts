import type { PrintAppearance, PrintColorMode } from "../../services/print/types";

export const printStyles = `
  @font-face {
    font-family: 'Jameel Noori Nastaleeq';
    src: local('Jameel Noori Nastaleeq'), local('JameelNooriNastaleeq');
    font-weight: normal;
    font-style: normal;
    font-display: swap;
  }

  :root {
    --font-urdu: 'Jameel Noori Nastaleeq', 'Noto Nastaliq Urdu', 'Nafees Nastaleeq', 'Pak Nastaleeq', serif;
    /*
     * B&W-printer-friendly palette: no coloured fills that waste toner.
     * Structure uses black borders and bold text instead of background colour.
     */
    --primary: #000000;
    --primary-deep: #000000;
    --primary-soft: #ffffff;
    --primary-mist: #ffffff;
    --gold: #000000;
    --gold-soft: #ffffff;

    --ink: #000000;
    --ink-secondary: #222222;
    --muted: #444444;
    --border: #aaaaaa;
    --border-strong: #666666;

    --bg: #ffffff;
    --surface: #f5f5f5;
    --surface-strong: #eeeeee;
    --party-bg: #f5f5f5;
    --totals-bg: #f0f0f0;
    --zebra-bg: #f8f8f8;

    --head-bg: #000000;
    --head-ink: #ffffff;
    --head-border: #000000;
    --grand-bg: #000000;
    --grand-ink: #ffffff;

    --font-body: "Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    --font-mono: "Cascadia Mono", Consolas, "Courier New", monospace;

    --page-width: 210mm;
    --page-height: 297mm;
    --page-margin-top: 10mm;
    --page-margin-right: 10mm;
    --page-margin-bottom: 10mm;
    --page-margin-left: 10mm;
    --preview-bg: #ffffff;

    --summary-font-size: 12px;
    --table-font-size: 12px;

    --radius-sm: 4px;
    --radius-md: 6px;
    --radius-lg: 10px;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    font-family: var(--font-body);
    color: var(--ink);
    background: var(--bg);
    margin: 0;
    padding: 0;
    font-size: 13px;
    line-height: 1.55;
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
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
    /* Content flows naturally; in print, paginates across pages. */
    overflow: visible;
  }

  .doc {
    position: relative;
    box-sizing: border-box;
    width: 100%;
    max-width: 100%;
    min-height: 100%;
    padding: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
  }

  .doc * {
    max-width: 100%;
  }

  /* ------------------------------------------------------------------ header */

  .header {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, auto);
    gap: 16px;
    align-items: end;
    padding-bottom: 14px;
    margin-bottom: 16px;
    /*
     * Three-layer divider: a fine gold hairline over a medium primary bar over
     * a faint wash. The layers create a sense of depth without any actual
     * elevation.
     */
    background-image:
      linear-gradient(to right, var(--gold), var(--gold)),
      linear-gradient(to right, var(--primary), var(--primary)),
      linear-gradient(to right, var(--primary-soft), var(--primary-soft));
    background-repeat: no-repeat;
    background-position: left bottom, left bottom, left bottom;
    background-size: 100% 1px, 100% 3px, 100% 5px;
  }

  .brand {
    display: flex;
    gap: 14px;
    align-items: center;
    min-width: 0;
  }

  .brand > div {
    min-width: 0;
  }

  .brand-logo {
    width: 50px;
    height: 50px;
    flex: 0 0 auto;
    border-radius: var(--radius-md);
    object-fit: contain;
    background: transparent;
    border: none;
    padding: 0;
  }

  .brand-title {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -0.01em;
    color: var(--primary-deep);
    overflow-wrap: anywhere;
  }

  .brand-meta {
    margin-top: 4px;
    font-size: 10px;
    line-height: 1.5;
    color: var(--muted);
    letter-spacing: 0.01em;
    overflow-wrap: anywhere;
  }

  .header-right {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 14px;
    min-width: 0;
  }

  /*
   * Verification QR in the header's top-right corner. A fixed intrinsic size
   * with a non-shrinking box keeps it crisp; the title beside it absorbs any
   * width pressure so the header never overflows the page.
   */
  .header-qr {
    flex: 0 0 auto;
    line-height: 0;
  }

  .header-qr img {
    width: 64px;
    height: 64px;
    display: block;
  }

  .doc-title {
    text-align: right;
    min-width: 0;
  }

  .doc-title h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--primary-deep);
    overflow-wrap: anywhere;
  }

  .doc-title .doc-no {
    display: inline-block;
    margin-top: 6px;
    font-size: 10px;
    font-family: var(--font-mono);
    color: var(--ink-secondary);
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    padding: 2px 10px;
    letter-spacing: 0.02em;
    overflow-wrap: anywhere;
  }

  /* ------------------------------------------------------------ meta chips */

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 11px;
    color: var(--ink-secondary);
    margin-bottom: 14px;
  }

  .meta-chip {
    background: var(--surface);
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    padding: 4px 10px;
    border-radius: var(--radius-sm);
    white-space: normal;
    overflow-wrap: anywhere;
    max-width: 100%;
    line-height: 1.4;
    font-size: 10.5px;
  }

  .meta-chip.party-chip {
    background: var(--party-bg);
    border-color: var(--primary);
    border-left-width: 4px;
    color: var(--primary-deep);
    font-size: 11px;
    font-weight: 600;
  }

  /* -------------------------------------------------------- summary panel */

  /*
   * Wide reports size their columns to content like everything else; only the
   * 80mm roll is too narrow for that, where an even split is the one way 12
   * numeric columns fit at all.
   */
  .paper-thermal80 table {
    table-layout: fixed;
  }

  .doc-key-report-stock thead th,
  .doc-key-report-stock tbody td {
    font-size: var(--table-font-size);
    padding: 5px 4px;
    line-height: 1.3;
  }

  /*
   * Cells wrap between words only ("Opening / Qty", never "CATEGO / RY").
   * With "break anywhere", auto layout shrank the last column to one character
   * and printed figures as vertical strips. Figures carry their own break
   * points after each thousands comma (see mapStockReport).
   */
  body.doc-key-report-stock:not(.paper-thermal80) thead th,
  body.doc-key-report-stock:not(.paper-thermal80) tbody td {
    overflow-wrap: normal;
    word-break: normal;
  }

  /* Totals are the figures people read first; never split them. */
  body.doc-key-report-stock:not(.paper-thermal80) .totals-row td {
    white-space: nowrap;
  }

  /* Never orphan the totals row on a page of its own. */
  .totals-row {
    break-before: avoid;
    page-break-before: avoid;
  }

  body.doc-key-report-stock.page-narrow:not(.paper-thermal80) thead th,
  body.doc-key-report-stock.page-narrow:not(.paper-thermal80) tbody td {
    font-size: 8px;
    padding: 4px 3px;
    letter-spacing: 0;
  }

  body.doc-key-report-stock.page-tiny:not(.paper-thermal80) thead th,
  body.doc-key-report-stock.page-tiny:not(.paper-thermal80) tbody td {
    font-size: 7px;
    padding: 3px 2px;
  }

  body.doc-key-report-stock.page-tiny:not(.paper-thermal80) thead th {
    overflow-wrap: anywhere;
  }

  /*
   * One summary component for every printable document (invoices and reports
   * alike). Rows print in the order the mapper emitted them; the row the
   * mapper names as the grand total gets the emphasis treatment below. The
   * whole panel opts out of page breaks so the totals are never orphaned from
   * the figures they sum.
   */
  .summary-table {
    margin: 14px 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .summary-title {
    background: var(--head-bg);
    color: var(--head-ink);
    font-size: 9.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    padding: 6px 12px;
    border-bottom: 1px solid var(--head-border);
  }

  .summary-table table {
    table-layout: auto;
    margin-bottom: 0;
    border: none;
  }

  .summary-table td {
    border: none;
    padding: 5px 12px;
    font-size: var(--summary-font-size);
    vertical-align: top;
  }

  .summary-table tr + tr td {
    border-top: 1px solid var(--border);
  }

  .summary-table td.label {
    color: var(--muted);
    font-size: 11px;
    overflow-wrap: anywhere;
  }

  .summary-table td.value {
    font-family: var(--font-mono);
    font-weight: 600;
    color: var(--ink);
    text-align: right;
    font-size: var(--summary-font-size);
    overflow-wrap: anywhere;
  }

  .summary-table tbody tr:nth-child(even):not(.grand):not(.highlight) td {
    background: var(--zebra-bg);
  }

  .summary-table tr.highlight td {
    background: var(--primary-mist);
  }

  .summary-table tr.highlight td.label,
  .summary-table tr.highlight td.value {
    color: var(--primary-deep);
  }

  /*
   * Grand total: bold, a heavier rule above it, and a slightly larger figure.
   * Selected by class, not by being the last row, so a document whose summary
   * does not end on a total (every report) never gets the emphasis by accident.
   */
  .summary-table tr.grand td {
    background: var(--grand-bg);
    color: var(--grand-ink);
    font-weight: 700;
    border-top: 2px solid var(--primary-deep);
  }

  .summary-table tr.grand td.label {
    color: var(--grand-ink);
    font-size: 11px;
    letter-spacing: 0.03em;
  }

  .summary-table tr.grand td.value {
    color: var(--grand-ink);
    font-size: calc(var(--summary-font-size) + 1px);
  }

  /* --------------------------------------------------------------- tables */

  /*
   * Auto rather than fixed: with no explicit widths a fixed layout splits
   * the row evenly, which gave "Sr.No" the same width as "Particulars" and
   * squeezed long item names into three lines while numeric columns sat half
   * empty. Auto sizes each column to its content and hands the slack to the
   * text columns.
   */
  table {
    width: 100%;
    max-width: 100%;
    border-collapse: collapse;
    margin-bottom: 10px;
    table-layout: auto;
  }

  thead th {
    background: var(--head-bg);
    color: var(--head-ink);
    border: 1px solid var(--head-border);
    padding: 7px 8px;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    vertical-align: bottom;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  thead {
    display: table-header-group;
  }

  tbody td {
    border: 1px solid var(--border);
    padding: 6px 8px;
    font-size: var(--table-font-size);
    vertical-align: top;
    white-space: normal;
    overflow-wrap: anywhere;
    word-break: break-word;
  }

  tbody tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .doc > table tbody tr:nth-child(even):not(.totals-row):not(.group-row) td {
    background: var(--zebra-bg);
  }

  .align-right {
    text-align: right;
  }

  .align-center {
    text-align: center;
  }

  .group-row td {
    background: var(--primary-soft);
    color: var(--primary-deep);
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    font-size: 11px;
    border-bottom: 2px solid var(--primary);
  }

  .totals-row td {
    font-weight: 700;
    color: var(--ink);
    background: var(--totals-bg);
    border-top: 2px solid var(--primary);
  }

  /* ------------------------------------------------------- notes/signatures */

  .notes {
    border: 1px solid var(--border);
    border-left: 3px solid var(--primary);
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background: var(--surface);
    margin-bottom: 10px;
    overflow-wrap: anywhere;
    font-size: 11px;
    line-height: 1.6;
    color: var(--ink-secondary);
  }

  .notes strong {
    font-weight: 700;
    color: var(--primary-deep);
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  /* Signatures are now inside the verification block. */

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
    opacity: 0.04;
    color: var(--ink);
    white-space: nowrap;
    transform: rotate(-22deg);
    letter-spacing: 0.08em;
    font-weight: 300;
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

  /* ------------------------------------------------- verification / sign-off */

  .verification-block {
    margin-top: 24px;
    border-top: 2px solid var(--primary);
    padding-top: 14px;
  }

  .verification-row {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: flex-start;
    justify-content: space-between;
  }

  .verification-prepared {
    flex: 1 1 auto;
    align-self: flex-end;
  }

  .verification-role {
    font-size: 10.5px;
    font-weight: 700;
    color: var(--ink);
  }

  .verification-dept {
    font-size: 9px;
    color: var(--muted);
    margin-top: 1px;
  }






  .verification-sig {
    flex: 1 1 auto;
    min-width: 64px;
    max-width: 100px;
    text-align: center;
    padding-top: 40px;
    margin-top: auto;
    align-self: flex-end;
  }

  .verification-sig-label {
    font-size: 8.5px;
    font-weight: 600;
    color: var(--muted);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .verification-sig-name {
    font-size: 8px;
    color: var(--ink-secondary);
    margin-top: 1px;
    overflow-wrap: anywhere;
  }

  .verification-note {
    margin-top: 10px;
    padding: 6px 10px;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    font-size: 7.5px;
    color: var(--muted);
    line-height: 1.5;
  }

  .verification-note strong {
    color: var(--ink-secondary);
  }

  /* --------------------------------------------------------- urdu / rtl text */

  [lang="ur"],
  .urdu-text {
    font-family: var(--font-urdu);
    direction: rtl;
    line-height: 1.8;
  }

  thead th[lang="ur"],
  tbody td[lang="ur"] {
    font-family: var(--font-urdu);
    direction: rtl;
    font-size: calc(var(--table-font-size) + 2px);
    line-height: 1.7;
  }

  /* ------------------------------------------------------------ thermal roll */

  .paper-thermal80 {
    font-size: 10.5px;
    --head-bg: transparent;
    --head-ink: var(--ink);
    --head-border: var(--border);
    --grand-bg: transparent;
    --grand-ink: var(--ink);
    --primary-soft: transparent;
    --primary-mist: transparent;
    --zebra-bg: transparent;
  }

  .paper-thermal80 .header {
    display: block;
    text-align: center;
    background-image: none;
    padding-bottom: 6px;
    margin-bottom: 8px;
    border-bottom: 1px solid var(--border);
  }

  .paper-thermal80 .brand {
    display: block;
    text-align: center;
  }

  .paper-thermal80 .brand-logo {
    margin: 0 auto 4px;
    width: 34px;
    height: 34px;
    padding: 0;
    border: none;
  }

  .paper-thermal80 .brand-title {
    font-size: 13px;
  }

  .paper-thermal80 .header-right {
    flex-direction: row;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .paper-thermal80 .header-qr img {
    width: 52px;
    height: 52px;
  }

  .paper-thermal80 .doc-title {
    text-align: center;
    margin-top: 4px;
  }

  .paper-thermal80 .doc-title h1 {
    font-size: 11px;
  }

  .paper-thermal80 .doc-title .doc-no {
    border: none;
    background: none;
    padding: 0;
  }

  .paper-thermal80 .meta {
    display: block;
    font-size: 9.5px;
  }

  .paper-thermal80 .meta-chip {
    display: block;
    border: none;
    border-radius: 0;
    background: none;
    padding: 1px 0;
    font-weight: 400;
    font-size: 9.5px;
  }

  .paper-thermal80 .meta-chip.party-chip {
    border: none;
    font-size: 9.5px;
  }

  .paper-thermal80 .summary-table {
    border: none;
    border-radius: 0;
  }

  .paper-thermal80 .summary-title {
    padding: 2px 0;
    border-bottom: 1px solid var(--border);
  }

  .paper-thermal80 {
    --summary-font-size: 9px;
    --table-font-size: 9.5px;
  }

  .paper-thermal80 thead th,
  .paper-thermal80 tbody td,
  .paper-thermal80 .summary-table td {
    padding: 3px 2px;
  }

  .paper-thermal80 .verification-block {
    margin-top: 10px;
    padding-top: 8px;
  }

  .paper-thermal80 .verification-row {
    flex-direction: column;
    align-items: center;
    gap: 6px;
  }

  .paper-thermal80 .verification-sig {
    min-width: 0;
    max-width: none;
    width: 100%;
    padding-top: 20px;
  }

  @media print {
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

    .watermark {
      position: fixed;
    }

    /* Interactive / screen-only affordances never reach paper. */
    .no-print,
    .screen-only {
      display: none !important;
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
    --ink: #181818;
    --ink-secondary: #333333;
    --muted: #555555;
    --border: #c0c0c0;
    --border-strong: #909090;
    --primary: #404040;
    --primary-deep: #1a1a1a;
    --primary-soft: #ededed;
    --primary-mist: #f2f2f2;
    --gold: #808080;
    --gold-soft: #f0f0f0;
    --surface: #f4f4f4;
    --surface-strong: #e0e0e0;
    --party-bg: #e8e8e8;
    --totals-bg: #e5e5e5;
    --zebra-bg: #f5f5f5;
    --head-bg: #383838;
    --head-ink: #ffffff;
    --head-border: #383838;
    --grand-bg: #1a1a1a;
    --grand-ink: #ffffff;
  `,
  bw: `
    --ink: #000000;
    --ink-secondary: #000000;
    --muted: #333333;
    --border: #999999;
    --border-strong: #666666;
    --primary: #000000;
    --primary-deep: #000000;
    --primary-soft: #ffffff;
    --primary-mist: #ffffff;
    --gold: #000000;
    --gold-soft: #ffffff;
    --surface: #ffffff;
    --surface-strong: #ffffff;
    --party-bg: #ffffff;
    --totals-bg: #f5f5f5;
    --zebra-bg: #f5f5f5;
    --head-bg: #000000;
    --head-ink: #ffffff;
    --head-border: #000000;
    --grand-bg: #000000;
    --grand-ink: #ffffff;
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
      :root {
        --surface: #ffffff;
        --surface-strong: #ffffff;
        --party-bg: #ffffff;
        --totals-bg: #ffffff;
        --zebra-bg: #ffffff;
        --primary-soft: #ffffff;
        --primary-mist: #ffffff;
        --head-bg: #ffffff;
        --head-ink: var(--ink);
        --head-border: var(--border);
        --grand-bg: #ffffff;
        --grand-ink: var(--ink);
      }
      .header {
        background-image: none;
        border-bottom: 1px solid var(--border);
      }
      .meta-chip,
      .notes,
      thead th,
      .summary-title,
      .group-row td,
      .totals-row td,
      .summary-table tr.grand td {
        background: #ffffff;
      }
      .summary-table tr.grand td.value,
      .summary-table tr.grand td.label,
      .summary-table tr.highlight td.label,
      .summary-table tr.highlight td.value {
        color: var(--ink);
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
