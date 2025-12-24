import { Router } from "express";
import {
  createReceipt,
  deleteReceipt,
  getNextReceiptNumber,
  getReceipt,
  listReceipts,
  updateReceipt,
} from "../controllers/receipts.controller";

const router = Router();

router.get("/api/receipts", listReceipts);
router.get("/api/receipts/next-number", getNextReceiptNumber);
router.get("/api/receipts/:id", getReceipt);
router.post("/api/receipts", createReceipt);
router.patch("/api/receipts/:id", updateReceipt);
router.delete("/api/receipts/:id", deleteReceipt);

export default router;
