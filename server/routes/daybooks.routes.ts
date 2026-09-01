import { Router } from "express";
import {
  cancelGeneralJournal,
  cashBalances,
  createCashBook,
  createGeneralJournal,
  createPurchaseReturnsDaybook,
  createPurchasesDaybook,
  createSalesDaybook,
  createSalesReturnsDaybook,
  daybookAudit,
  daybookDashboardSummary,
  deleteCashBook,
  deleteGeneralJournal,
  deletePurchaseReturnsDaybook,
  deletePurchasesDaybook,
  deleteSalesDaybook,
  deleteSalesReturnsDaybook,
  exportDaybook,
  getCashBook,
  getGeneralJournal,
  getPurchaseReturnsDaybook,
  getPurchasesDaybook,
  getSalesDaybook,
  getSalesReturnsDaybook,
  listCashBook,
  listGeneralJournal,
  listPurchaseReturnsDaybook,
  listPurchasesDaybook,
  listSalesDaybook,
  listSalesReturnsDaybook,
  migrateLegacyDaybook,
  outstandingPayables,
  purchasesSupplierSummary,
  reverseGeneralJournal,
  salesAging,
  salesCustomerSummary,
  updateCashBook,
  updateGeneralJournal,
  updatePurchaseReturnsDaybook,
  updatePurchasesDaybook,
  updateSalesDaybook,
  updateSalesReturnsDaybook,
} from "../controllers/daybooks.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/daybooks/dashboard", requireRoles(Roles.finance), daybookDashboardSummary);
router.get("/api/daybooks/audit", requireRoles(Roles.finance), daybookAudit);
router.post("/api/daybooks/migrate", requireRoles(Roles.finance), migrateLegacyDaybook);
router.get("/api/daybooks/:kind/export", requireRoles(Roles.finance), exportDaybook);

router.get("/api/daybooks/sales", requireRoles(Roles.finance), listSalesDaybook);
router.get("/api/daybooks/sales/summary", requireRoles(Roles.finance), salesCustomerSummary);
router.get("/api/daybooks/sales/aging", requireRoles(Roles.finance), salesAging);
router.get("/api/daybooks/sales/:id", requireRoles(Roles.finance), getSalesDaybook);
router.post("/api/daybooks/sales", requireRoles(Roles.finance), createSalesDaybook);
router.patch("/api/daybooks/sales/:id", requireRoles(Roles.finance), updateSalesDaybook);
router.delete("/api/daybooks/sales/:id", requireRoles(Roles.finance), deleteSalesDaybook);

router.get("/api/daybooks/purchases", requireRoles(Roles.finance), listPurchasesDaybook);
router.get("/api/daybooks/purchases/summary", requireRoles(Roles.finance), purchasesSupplierSummary);
router.get("/api/daybooks/purchases/payables", requireRoles(Roles.finance), outstandingPayables);
router.get("/api/daybooks/purchases/:id", requireRoles(Roles.finance), getPurchasesDaybook);
router.post("/api/daybooks/purchases", requireRoles(Roles.finance), createPurchasesDaybook);
router.patch("/api/daybooks/purchases/:id", requireRoles(Roles.finance), updatePurchasesDaybook);
router.delete("/api/daybooks/purchases/:id", requireRoles(Roles.finance), deletePurchasesDaybook);

router.get("/api/daybooks/cash", requireRoles(Roles.finance), listCashBook);
router.get("/api/daybooks/cash/balances", requireRoles(Roles.finance), cashBalances);
router.get("/api/daybooks/cash/:id", requireRoles(Roles.finance), getCashBook);
router.post("/api/daybooks/cash", requireRoles(Roles.finance), createCashBook);
router.patch("/api/daybooks/cash/:id", requireRoles(Roles.finance), updateCashBook);
router.delete("/api/daybooks/cash/:id", requireRoles(Roles.finance), deleteCashBook);

router.get("/api/daybooks/sales-returns", requireRoles(Roles.finance), listSalesReturnsDaybook);
router.get("/api/daybooks/sales-returns/:id", requireRoles(Roles.finance), getSalesReturnsDaybook);
router.post("/api/daybooks/sales-returns", requireRoles(Roles.finance), createSalesReturnsDaybook);
router.patch("/api/daybooks/sales-returns/:id", requireRoles(Roles.finance), updateSalesReturnsDaybook);
router.delete("/api/daybooks/sales-returns/:id", requireRoles(Roles.finance), deleteSalesReturnsDaybook);

router.get("/api/daybooks/purchase-returns", requireRoles(Roles.finance), listPurchaseReturnsDaybook);
router.get("/api/daybooks/purchase-returns/:id", requireRoles(Roles.finance), getPurchaseReturnsDaybook);
router.post("/api/daybooks/purchase-returns", requireRoles(Roles.finance), createPurchaseReturnsDaybook);
router.patch("/api/daybooks/purchase-returns/:id", requireRoles(Roles.finance), updatePurchaseReturnsDaybook);
router.delete("/api/daybooks/purchase-returns/:id", requireRoles(Roles.finance), deletePurchaseReturnsDaybook);

router.get("/api/daybooks/general-journal", requireRoles(Roles.finance), listGeneralJournal);
router.get("/api/daybooks/general-journal/:id", requireRoles(Roles.finance), getGeneralJournal);
router.post("/api/daybooks/general-journal", requireRoles(Roles.finance), createGeneralJournal);
router.patch("/api/daybooks/general-journal/:id", requireRoles(Roles.finance), updateGeneralJournal);
router.post("/api/daybooks/general-journal/:id/reverse", requireRoles(Roles.finance), reverseGeneralJournal);
router.post("/api/daybooks/general-journal/:id/cancel", requireRoles(Roles.finance), cancelGeneralJournal);
router.delete("/api/daybooks/general-journal/:id", requireRoles(Roles.finance), deleteGeneralJournal);

export default router;

