import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { format } from "date-fns";
import type { Purchase, Account } from "@shared/schema";
import type { PrintableDocumentPayload, PrintableTableColumn } from "@shared/print";

type PurchaseWithSupplier = Purchase & { supplier?: Account };

const px = (n: number) => n;

const currency = (value: string | number) => {
  const num = typeof value === "number" ? value : parseFloat(value || "0") || 0;
  return `Rs. ${num.toLocaleString()}`;
};

export async function generatePurchasesPdf(options: {
  purchases: PurchaseWithSupplier[];
  businessName?: string;
  businessNameUrdu?: string;
  generatedAt?: Date;
  preparedBy?: string;
}) {
  const { purchases, businessName, businessNameUrdu, preparedBy } = options;
  const generatedAt = options.generatedAt || new Date();

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([px(595.28), px(841.89)]); // A4 portrait in points
  let { width, height } = page.getSize();
  const marginX = px(36);
  let cursorY = height - px(48);

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const headerText = businessName || "Company Name";
  page.drawText(headerText, {
    x: marginX,
    y: cursorY,
    size: 16,
    font: fontBold,
    color: rgb(0.12, 0.12, 0.12),
  });
  cursorY -= px(18);

  if (businessNameUrdu) {
    page.drawText(businessNameUrdu, {
      x: marginX,
      y: cursorY,
      size: 12,
      font: fontRegular,
      color: rgb(0.2, 0.2, 0.2),
    });
    cursorY -= px(14);
  }

  page.drawText("Purchases Report", {
    x: marginX,
    y: cursorY,
    size: 12,
    font: fontBold,
  });
  cursorY -= px(14);

  page.drawText(`Generated: ${format(generatedAt, "dd MMM yyyy, HH:mm")}`, {
    x: marginX,
    y: cursorY,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35),
  });

  const totals = purchases.reduce(
    (acc, p) => {
      const total = parseFloat(p.totalAmount || "0") || 0;
      const paid = parseFloat(p.paidAmount || "0") || 0;
      acc.total += total;
      acc.paid += paid;
      acc.due += Math.max(total - paid, 0);
      return acc;
    },
    { total: 0, paid: 0, due: 0 }
  );

  const rightColX = width - marginX - px(180);
  cursorY = height - px(62);
  const summaryLines = [
    ["Total Amount", currency(totals.total)],
    ["Paid", currency(totals.paid)],
    ["Balance Due", currency(totals.due)],
    preparedBy ? ["Prepared by", preparedBy] : null,
  ].filter(Boolean) as [string, string][];

  summaryLines.forEach(([label, value]) => {
    page.drawText(label, {
      x: rightColX,
      y: cursorY,
      size: 10,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.25),
    });
    page.drawText(value, {
      x: rightColX + px(95),
      y: cursorY,
      size: 10,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    cursorY -= px(14);
  });

  cursorY = height - px(110);
  const colWidths = [px(70), px(70), px(150), px(70), px(70), px(70), px(70)];
  const colTitles = ["Invoice #", "Date", "Supplier", "Vehicle", "Total", "Paid", "Balance"];
  const tableX = marginX;
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);
  const rowHeight = px(20);
  let pageNumber = 1;

  const drawHeader = () => {
    let x = tableX;
    colTitles.forEach((title, idx) => {
      page.drawRectangle({
        x,
        y: cursorY - rowHeight + px(4),
        width: colWidths[idx],
        height: rowHeight,
        color: rgb(0.95, 0.95, 0.95),
        borderWidth: 1,
        borderColor: rgb(0.78, 0.78, 0.78),
      });
      page.drawText(title, {
        x: x + px(4),
        y: cursorY - px(12),
        size: 10,
        font: fontBold,
      });
      x += colWidths[idx];
    });
    cursorY -= rowHeight;
  };

  const ensureSpace = () => {
    if (cursorY - rowHeight < px(40)) {
      page.drawText(`Page ${pageNumber}`, {
        x: width - marginX - px(60),
        y: px(20),
        size: 10,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      });
      pageNumber += 1;
      page = pdfDoc.addPage([px(595.28), px(841.89)]);
      const size = page.getSize();
      width = size.width;
      height = size.height;
      cursorY = height - px(40);
      drawHeader();
    }
  };

  drawHeader();

  purchases.forEach((p) => {
    ensureSpace();
    const total = parseFloat(p.totalAmount || "0") || 0;
    const paid = parseFloat(p.paidAmount || "0") || 0;
    const due = Math.max(total - paid, 0);
    const cells = [
      p.invoiceNumber || "-",
      format(new Date(p.purchaseDate), "dd MMM yyyy"),
      `${p.supplier?.name || "-"}`,
      p.vehicleNumber || "-",
      currency(total),
      currency(paid),
      due > 0 ? currency(due) : "Paid",
    ];
    let x = tableX;
    cells.forEach((cell, idx) => {
      page.drawRectangle({
        x,
        y: cursorY - rowHeight + px(4),
        width: colWidths[idx],
        height: rowHeight,
        borderWidth: 1,
        borderColor: rgb(0.88, 0.88, 0.88),
      });
      page.drawText(String(cell), {
        x: x + px(4),
        y: cursorY - px(12),
        size: 9,
        font: fontRegular,
        color: rgb(0.15, 0.15, 0.15),
      });
      x += colWidths[idx];
    });
    cursorY -= rowHeight;
  });

  page.drawText(`Page ${pageNumber}`, {
    x: width - marginX - px(60),
    y: px(20),
    size: 10,
    font: fontRegular,
    color: rgb(0.4, 0.4, 0.4),
  });

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}

export async function downloadPurchasesPdf(args: Parameters<typeof generatePurchasesPdf>[0]) {
  const blob = await generatePurchasesPdf(args);
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "purchases-report.pdf";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 20000);
}

type LedgerPdfOptions = {
  payload: PrintableDocumentPayload;
};

const wrapText = (text: string, font: any, fontSize: number, maxWidth: number) => {
  const lines: string[] = [];
  const paragraphs = text.split("\n");
  for (const paragraph of paragraphs) {
    const words = paragraph.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      const width = font.widthOfTextAtSize(candidate, fontSize);
      if (width <= maxWidth) {
        current = candidate;
      } else if (current) {
        lines.push(current);
        current = word;
      } else {
        let remaining = word;
        while (remaining.length > 0) {
          let slice = remaining;
          while (font.widthOfTextAtSize(slice, fontSize) > maxWidth && slice.length > 1) {
            slice = slice.slice(0, -1);
          }
          lines.push(slice);
          remaining = remaining.slice(slice.length);
        }
        current = "";
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
};

const ledgerColumnWidths = (keys: string[], totalWidth: number) => {
  const weights: Record<string, number> = {
    date: 0.12,
    narration: 0.52,
    debit: 0.12,
    credit: 0.12,
    balance: 0.12,
  };
  const totalWeight = keys.reduce((sum, key) => sum + (weights[key] || 0.1), 0);
  const widths = keys.map((key) => Math.floor((totalWidth * (weights[key] || 0.1)) / totalWeight));
  const used = widths.reduce((sum, w) => sum + w, 0);
  if (widths.length && used !== totalWidth) {
    widths[widths.length - 1] += totalWidth - used;
  }
  return widths;
};

const headerLabel = (columns: PrintableTableColumn[], key: string, fallback: string) => {
  const col = columns.find((c) => c.key === key);
  return col?.label || fallback;
};

export async function generateLedgerPdf({ payload }: LedgerPdfOptions) {
  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([px(595.28), px(841.89)]);
  let { width, height } = page.getSize();
  const marginX = px(34);
  const marginTop = px(34);
  const marginBottom = px(34);
  let cursorY = height - marginTop;

  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontMono = await pdfDoc.embedFont(StandardFonts.Courier);
  const fontMonoBold = await pdfDoc.embedFont(StandardFonts.CourierBold);

  const accountName = payload.meta?.filters?.Account || "Account Ledger";
  const dateFrom = payload.meta?.dateFrom || "";
  const dateTo = payload.meta?.dateTo || "";
  const dateRange =
    dateFrom || dateTo
      ? `${dateFrom || "Start"} - ${dateTo || "End"}`
      : "All dates";
  const headerHeight = px(30);
  let pageNumber = 1;
  const printedAt = new Date();
  const printedLabel = `Printed ${printedAt.toLocaleString("en-GB")}`;

  const drawPageFooter = () => {
    const footerY = marginBottom - px(10);
    page.drawText(printedLabel, {
      x: marginX,
      y: footerY,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    const pageText = `Page ${pageNumber}`;
    const pageTextWidth = fontRegular.widthOfTextAtSize(pageText, 8);
    page.drawText(pageText, {
      x: width - marginX - pageTextWidth,
      y: footerY,
      size: 8,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
  };

  const drawPageHeader = () => {
    const headerTop = height - marginTop;
    page.drawText(String(accountName), {
      x: marginX,
      y: headerTop - px(12),
      size: 12,
      font: fontBold,
      color: rgb(0.1, 0.1, 0.1),
    });
    page.drawText(dateRange, {
      x: marginX,
      y: headerTop - px(24),
      size: 9,
      font: fontRegular,
      color: rgb(0.4, 0.4, 0.4),
    });
    page.drawLine({
      start: { x: marginX, y: headerTop - headerHeight },
      end: { x: width - marginX, y: headerTop - headerHeight },
      thickness: 1,
      color: rgb(0.82, 0.82, 0.82),
    });
    cursorY = headerTop - headerHeight - px(6);
    drawPageFooter();
  };

  const table = payload.table;
  if (!table) {
    const pdfBytes = await pdfDoc.save();
    return new Blob([pdfBytes], { type: "application/pdf" });
  }

  const columnKeys = table.columns.map((c) => c.key);
  const tableWidth = width - marginX * 2;
  const columnWidths = ledgerColumnWidths(columnKeys, tableWidth);
  const rowPadding = px(4);
  const lineHeight = px(11);

  const drawHeader = () => {
    let x = marginX;
    const headerHeight = px(18);
    columnKeys.forEach((key, idx) => {
      page.drawRectangle({
        x,
        y: cursorY - headerHeight + px(4),
        width: columnWidths[idx],
        height: headerHeight,
        color: rgb(0.96, 0.96, 0.96),
        borderWidth: 1,
        borderColor: rgb(0.82, 0.82, 0.82),
      });
      page.drawText(
        headerLabel(table.columns, key, key),
        {
          x: x + px(4),
          y: cursorY - px(12),
          size: 8.5,
          font: fontBold,
          color: rgb(0.12, 0.12, 0.12),
        },
      );
      x += columnWidths[idx];
    });
    cursorY -= headerHeight;
  };

  const ensureSpace = (heightNeeded: number) => {
    if (cursorY - heightNeeded < marginBottom) {
      pageNumber += 1;
      page = pdfDoc.addPage([px(595.28), px(841.89)]);
      const size = page.getSize();
      width = size.width;
      height = size.height;
      cursorY = height - marginTop;
      drawPageHeader();
      drawHeader();
    }
  };

  drawPageHeader();
  drawHeader();

  const rows = table.rows || [];
  for (const row of rows) {
    const cellLines = columnKeys.map((key, idx) => {
      const value = row[key];
      const text = value === null || value === undefined ? "" : String(value);
      if (key === "debit" || key === "credit" || key === "balance") {
        return [text];
      }
      return wrapText(text, fontRegular, 9, columnWidths[idx] - rowPadding * 2);
    });
    const maxLines = Math.max(...cellLines.map((lines) => lines.length), 1);
    const rowHeight = maxLines * lineHeight + rowPadding * 2;

    ensureSpace(rowHeight);

    let x = marginX;
    columnKeys.forEach((key, idx) => {
      const widthCol = columnWidths[idx];
      page.drawRectangle({
        x,
        y: cursorY - rowHeight + px(4),
        width: widthCol,
        height: rowHeight,
        borderWidth: 1,
        borderColor: rgb(0.9, 0.9, 0.9),
      });

      const lines = cellLines[idx];
      lines.forEach((line, lineIndex) => {
        const textY = cursorY - rowPadding - lineHeight * lineIndex - px(10);
        if (key === "debit" || key === "credit" || key === "balance") {
          const textWidth = fontMono.widthOfTextAtSize(line, 9);
          page.drawText(line, {
            x: x + widthCol - rowPadding - textWidth,
            y: textY,
            size: 9,
            font: fontMono,
            color: rgb(0.1, 0.1, 0.1),
          });
        } else {
          page.drawText(line, {
            x: x + rowPadding,
            y: textY,
            size: 9,
            font: fontRegular,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
      });
      x += widthCol;
    });
    cursorY -= rowHeight;
  }

  if (table.totalsRow) {
    const totalsRow = table.totalsRow;
    const cellLines = columnKeys.map((key, idx) => {
      const value = totalsRow[key];
      const text = value === null || value === undefined ? "" : String(value);
      if (key === "debit" || key === "credit" || key === "balance") {
        return [text];
      }
      return wrapText(text, fontBold, 9, columnWidths[idx] - rowPadding * 2);
    });
    const maxLines = Math.max(...cellLines.map((lines) => lines.length), 1);
    const rowHeight = maxLines * lineHeight + rowPadding * 2;
    ensureSpace(rowHeight);
    let x = marginX;
    columnKeys.forEach((key, idx) => {
      const widthCol = columnWidths[idx];
      page.drawRectangle({
        x,
        y: cursorY - rowHeight + px(4),
        width: widthCol,
        height: rowHeight,
        borderWidth: 1,
        borderColor: rgb(0.8, 0.8, 0.8),
        color: rgb(0.93, 0.93, 0.93),
      });
      const lines = cellLines[idx];
      lines.forEach((line, lineIndex) => {
        const textY = cursorY - rowPadding - lineHeight * lineIndex - px(10);
        if (key === "debit" || key === "credit" || key === "balance") {
          const textWidth = fontMonoBold.widthOfTextAtSize(line, 9);
          page.drawText(line, {
            x: x + widthCol - rowPadding - textWidth,
            y: textY,
            size: 9,
            font: fontMonoBold,
            color: rgb(0.1, 0.1, 0.1),
          });
        } else {
          page.drawText(line, {
            x: x + rowPadding,
            y: textY,
            size: 9,
            font: fontBold,
            color: rgb(0.1, 0.1, 0.1),
          });
        }
      });
      x += widthCol;
    });
    cursorY -= rowHeight;
  }

  const pdfBytes = await pdfDoc.save();
  return new Blob([pdfBytes], { type: "application/pdf" });
}
