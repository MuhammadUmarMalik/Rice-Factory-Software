export const printStyles = `
  :root {
    --ink: #0f172a;
    --muted: #64748b;
    --border: #e2e8f0;
    --accent: #0ea5e9;
    --bg: #ffffff;
    --soft: #f8fafc;
    --soft-strong: #f1f5f9;
    --page-width: 210mm;
    --page-height: 297mm;
    --page-margin-top: 10mm;
    --page-margin-right: 10mm;
    --page-margin-bottom: 10mm;
    --page-margin-left: 10mm;
    --preview-bg: #e2e8f0;
    --preview-scale: 1;
  }

  @page {
    size: var(--page-width) var(--page-height);
    margin: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
  }

  * {
    // box-sizing: border-box;
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

  .doc {
    position: relative;
    min-height: 100%;
    padding: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
  }

  .header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 6px;
    margin-bottom: 8px;
  }

  .brand {
    display: flex;
    gap: 12px;
    align-items: center;
  }

  .brand-logo {
    width: 48px;
    height: 48px;
    border-radius: 6px;
    object-fit: cover;
    border: 1px solid var(--border);
  }

  .brand-title {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: 0.2px;
  }

  .brand-meta {
    font-size: 11px;
    color: var(--muted);
  }

  .doc-title {
    text-align: right;
  }

  .doc-title h1 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
  }

  .doc-title .doc-no {
    margin-top: 4px;
    font-size: 11px;
    color: var(--muted);
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
    font-size: 16.5px;
    color: var(--muted);
    margin-bottom: 8px;
  }

  .meta-chip {
    background: var(--soft);
    border: 1px solid var(--border);
    padding: 6px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .meta-chip.party-chip {
    background: #e0f2fe;
    border: 2px solid var(--accent);
    color: var(--ink);
    font-size: 13px;
    font-weight: 700;
    padding: 6px 10px;
  }

  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
    margin-bottom: 8px;
  }

  .doc-key-invoice-purchase .sections,
  .doc-key-invoice-sales .sections {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .section-card {
    border: 1px solid var(--border);
    background: var(--soft);
    padding: 8px 10px;
    border-radius: 8px;
  }

  .section-card .label {
    text-transform: uppercase;
    font-size: 10px;
    color: var(--muted);
    letter-spacing: 0.3px;
  }

  .section-card .value {
    font-size: 14px;
    font-weight: 700;
  }

  .section-card.party {
    border: 2px solid var(--accent);
    background: #e0f2fe;
  }

  .section-card.party .value {
    font-size: 16px;
    font-weight: 800;
  }

  table {
    width: 100%;
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
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  thead {
    display: table-header-group;
  }

  tbody td {
    border: 1px solid var(--border);
    padding: 7px 6px;
    vertical-align: top;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  tbody tr {
    page-break-inside: avoid;
  }

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
    background: #e5e7eb;
  }

  .notes {
    border: 1px dashed var(--border);
    padding: 8px 10px;
    border-radius: 8px;
    background: var(--soft);
    margin-bottom: 8px;
  }

  .signatures {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 18px;
    margin-top: 12px;
  }

  .signature {
    border-top: 1px solid var(--border);
    padding-top: 6px;
    font-size: 11px;
    text-align: center;
    color: var(--muted);
  }

  .footer {
    position: fixed;
    bottom: var(--page-margin-bottom);
    left: var(--page-margin-left);
    right: var(--page-margin-right);
    font-size: 10px;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
  }

  .watermark {
    position: fixed;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 72px;
    opacity: 0.05;
    color: var(--ink);
    transform: rotate(-20deg);
    pointer-events: none;
    z-index: 0;
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

  .page {
    position: relative;
    width: var(--page-width);
    min-height: var(--page-height);
    margin: 0 auto;
    background: var(--bg);
  }

  @media print {
    .page {
      transform: none;
      box-shadow: none;
    }
  }

  @media screen {
    body {
      background: var(--preview-bg);
    }

    .page {
      margin: 16px auto;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
      transform: scale(var(--preview-scale));
      transform-origin: top center;
    }

    .footer {
      position: absolute;
    }
  }
`;

export const dayBookStyles = `
  @page {
    size: var(--page-width) var(--page-height);
    margin: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    font-family: "Cambria", "Times New Roman", serif;
    color: var(--ink);
    background: var(--bg);
    margin: 0;
    padding: 0;
    font-size: 12.5px;
    line-height: 1.5;
  }

  .page {
    position: relative;
    width: var(--page-width);
    min-height: var(--page-height);
    margin: 0 auto;
    background: var(--bg);
  }

  .doc {
    width: 100%;
    padding: var(--page-margin-top) var(--page-margin-right) var(--page-margin-bottom) var(--page-margin-left);
  }

  .company-line {
    text-align: left;
    font-weight: 700;
    font-size: 16px;
    margin-bottom: 6px;
  }

  .title-bar {
    border: 1px solid var(--border);
    background: var(--soft-strong);
    text-align: left;
    font-weight: 700;
    padding: 6px 10px;
    margin-bottom: 6px;
    font-size: 14px;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }

  .print-line {
    border: 1px solid var(--border);
    background: var(--soft);
    padding: 6px 10px;
    margin-bottom: 8px;
    font-size: 11px;
    color: var(--muted);
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-bottom: 8px;
  }

  thead th {
    background: var(--soft-strong);
    border: 1px solid var(--border);
    padding: 7px 6px;
    font-weight: 700;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  thead {
    display: table-header-group;
  }

  tbody td {
    border: 1px solid var(--border);
    padding: 7px 6px;
    vertical-align: top;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  tbody tr {
    page-break-inside: avoid;
    break-inside: avoid;
  }

  .align-right {
    text-align: right;
  }

  .align-center {
    text-align: center;
  }

  .totals-row td {
    font-weight: 700;
    background: #e5e7eb;
  }

  @media screen {
    body {
      background: #e2e8f0;
    }

    .page {
      margin: 16px auto;
      box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
      transform: scale(var(--preview-scale));
      transform-origin: top center;
    }
  }
`;
