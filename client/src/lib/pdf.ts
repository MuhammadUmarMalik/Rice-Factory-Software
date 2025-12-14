import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { format } from "date-fns";
import type { Purchase, Account } from "@shared/schema";

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
