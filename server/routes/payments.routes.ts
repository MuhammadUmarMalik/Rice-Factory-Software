import { Router } from "express";
import {
  createPayment,
  deletePayment,
  getNextPaymentNumber,
  getPayment,
  listPayments,
  updatePayment,
} from "../controllers/payments.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/payments", requireRoles(Roles.finance), listPayments);
router.get("/api/payments/next-number", requireRoles(Roles.finance), getNextPaymentNumber);
router.get("/api/payments/:id", requireRoles(Roles.finance), getPayment);
router.post("/api/payments", requireRoles(Roles.finance), createPayment);
router.patch("/api/payments/:id", requireRoles(Roles.finance), updatePayment);
router.delete("/api/payments/:id", requireRoles(Roles.finance), deletePayment);

export default router;
