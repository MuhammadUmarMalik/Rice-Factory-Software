import { format } from "date-fns";
import { storage } from "../models/storage";

export async function getDashboardStats() {
  const profitLoss = await storage.getProfitLoss();
  const [purchases, sales] = await Promise.all([storage.getPurchases(), storage.getSales()]);
  const totalPurchases = purchases.reduce((sum, p) => sum + parseFloat(p.totalAmount || "0"), 0);
  const totalSales = sales.reduce((sum, s) => sum + parseFloat(s.totalAmount || "0"), 0);
  const products = await storage.getProducts();
  const stockValue = products.reduce(
    (sum, p) => sum + parseFloat(p.currentStock) * parseFloat(p.avgPurchasePrice),
    0,
  );

  return {
    totalPurchases: `Rs. ${totalPurchases.toLocaleString()}`,
    totalSales: `Rs. ${totalSales.toLocaleString()}`,
    stockValue: `Rs. ${stockValue.toLocaleString()}`,
    totalProfit: `Rs. ${parseFloat(profitLoss.netProfit).toLocaleString()}`,
  };
}

export async function getRecentActivity() {
  const [recentPurchases, recentSales, recentProcessing] = await Promise.all([
    storage.getPurchases(),
    storage.getSales(),
    storage.getProcessingBatches(),
  ]);

  return [
    ...recentPurchases.slice(0, 5).map((p) => ({
      type: "purchase",
      id: p.id,
      amount: p.totalAmount,
      date: p.purchaseDate,
      reference: p.invoiceNumber,
    })),
    ...recentSales.slice(0, 5).map((s) => ({
      type: "sale",
      id: s.id,
      amount: s.totalAmount,
      date: s.saleDate,
      reference: s.invoiceNumber,
    })),
    ...recentProcessing.slice(0, 5).map((p) => ({
      type: "processing",
      id: p.id,
      amount: p.sourceQuantity,
      date: p.startDate,
      reference: p.batchNumber,
    })),
  ]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 10);
}

export async function getDashboardCharts() {
  const [purchases, sales, products] = await Promise.all([
    storage.getPurchases(),
    storage.getSales(),
    storage.getProducts(),
  ]);

  const monthSlots = Array.from({ length: 6 }).map((_, index) => {
    const date = new Date();
    date.setMonth(date.getMonth() - (5 - index));
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    return { key, label: format(date, "MMM") };
  });

  const monthlyTotals = monthSlots.map(({ key, label }) => {
    const [year, month] = key.split("-").map(Number);

    const purchaseTotal = purchases
      .filter((p) => {
        const d = new Date(p.purchaseDate);
        return d.getFullYear() == year && d.getMonth() == month;
      })
      .reduce((sum, p) => sum + parseFloat(p.totalAmount || "0"), 0);

    const saleTotal = sales
      .filter((s) => {
        const d = new Date(s.saleDate);
        return d.getFullYear() == year && d.getMonth() == month;
      })
      .reduce((sum, s) => sum + parseFloat(s.totalAmount || "0"), 0);

    return {
      name: label,
      purchases: purchaseTotal,
      sales: saleTotal,
    };
  });

  const productStock = products.map((p) => ({
    name: p.name,
    stock: parseFloat(p.currentStock || "0"),
    unit: p.unit,
  }));

  return { monthlyTotals, productStock };
}
