import { Router } from "express";
import {
  createReceipt,
  deleteReceipt,
  getNextReceiptNumber,
  getReceipt,
  listReceipts,
  updateReceipt,
} from "../controllers/receipts.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/receipts", requireRoles(Roles.finance), listReceipts);
router.get("/api/receipts/next-number", requireRoles(Roles.finance), getNextReceiptNumber);
router.get("/api/receipts/:id", requireRoles(Roles.finance), getReceipt);
router.post("/api/receipts", requireRoles(Roles.finance), createReceipt);
router.patch("/api/receipts/:id", requireRoles(Roles.finance), updateReceipt);
router.delete("/api/receipts/:id", requireRoles(Roles.finance), deleteReceipt);

export default router;
