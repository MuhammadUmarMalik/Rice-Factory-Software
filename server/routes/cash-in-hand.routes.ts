import { Router } from "express";
import * as ctrl from "../controllers/cash-in-hand.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();
const finance = requireRoles(Roles.finance);

router.get("/api/cash/balance", finance, ctrl.getBalance);
router.get("/api/cash/receipts", finance, ctrl.getReceipts);
router.post("/api/cash/receipts", finance, ctrl.createReceipt);
router.get("/api/cash/receipts/:id", finance, ctrl.getReceiptById);
router.put("/api/cash/receipts/:id", finance, ctrl.updateReceipt);
router.delete("/api/cash/receipts/:id", finance, ctrl.deleteReceipt);

router.get("/api/cash/payments", finance, ctrl.getPayments);
router.post("/api/cash/payments", finance, ctrl.createPayment);
router.get("/api/cash/payments/:id", finance, ctrl.getPaymentById);
router.put("/api/cash/payments/:id", finance, ctrl.updatePayment);
router.delete("/api/cash/payments/:id", finance, ctrl.deletePayment);

router.get("/api/cash/ledger", finance, ctrl.getLedger);
router.get("/api/cash/summary", finance, ctrl.getSummary);

export default router;
