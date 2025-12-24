export const printStyles = `
  :root {
    --ink: #0f172a;
    --muted: #64748b;
    --border: #e2e8f0;
    --accent: #0ea5e9;
    --bg: #ffffff;
    --soft: #f8fafc;
  }

  @page {
    size: A4;
    margin: 14mm 12mm 16mm;
  }

  * {
    box-sizing: border-box;
  }

  body {
    font-family: "Times New Roman", "Georgia", serif;
    color: var(--ink);
    background: var(--bg);
    margin: 0;
    padding: 0;
    font-size: 12px;
    line-height: 1.45;
  }

  .doc {
    position: relative;
    min-height: 100%;
    padding-bottom: 20mm;
  }

  .header {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 12px;
    border-bottom: 1px solid var(--border);
    padding-bottom: 10px;
    margin-bottom: 12px;
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
    font-size: 16px;
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
    font-size: 11px;
    color: var(--muted);
    margin-bottom: 12px;
  }

  .meta-chip {
    background: var(--soft);
    border: 1px solid var(--border);
    padding: 4px 8px;
    border-radius: 999px;
  }

  .sections {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 8px;
    margin-bottom: 12px;
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

  table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 12px;
  }

  thead th {
    background: var(--soft);
    border: 1px solid var(--border);
    padding: 6px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  thead {
    display: table-header-group;
  }

  tbody td {
    border: 1px solid var(--border);
    padding: 6px;
    vertical-align: top;
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
    background: #f1f5f9;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 11px;
  }

  .totals-row td {
    font-weight: 700;
    background: #e2e8f0;
  }

  .notes {
    border: 1px dashed var(--border);
    padding: 8px;
    border-radius: 8px;
    background: var(--soft);
    margin-bottom: 12px;
  }

  .signatures {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
    margin-top: 18px;
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
    bottom: 8mm;
    left: 12mm;
    right: 12mm;
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
  }
`;
