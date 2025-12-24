import { Router } from "express";
import {
  createPurchase,
  deletePurchase,
  getNextBillNumber,
  getPurchase,
  listPurchases,
  updatePurchase,
} from "../controllers/purchases.controller";

const router = Router();

router.get("/api/purchases/next-bill-number", getNextBillNumber);
router.get("/api/purchases", listPurchases);
router.get("/api/purchases/:id", getPurchase);
router.post("/api/purchases", createPurchase);
router.patch("/api/purchases/:id", updatePurchase);
router.delete("/api/purchases/:id", deletePurchase);

export default router;
