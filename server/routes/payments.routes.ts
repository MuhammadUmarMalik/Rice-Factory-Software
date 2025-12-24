import { Router } from "express";
import {
  createPayment,
  deletePayment,
  getNextPaymentNumber,
  getPayment,
  listPayments,
  updatePayment,
} from "../controllers/payments.controller";

const router = Router();

router.get("/api/payments", listPayments);
router.get("/api/payments/next-number", getNextPaymentNumber);
router.get("/api/payments/:id", getPayment);
router.post("/api/payments", createPayment);
router.patch("/api/payments/:id", updatePayment);
router.delete("/api/payments/:id", deletePayment);

export default router;
