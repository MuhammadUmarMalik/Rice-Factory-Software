import { Router } from "express";
import {
  approveJournalVoucher,
  createJournalVoucher,
  deleteJournalVoucher,
  getJournalVoucher,
  getNextJournalNumber,
  listJournalVouchers,
  updateJournalVoucher,
} from "../controllers/journal-vouchers.controller";
import { requireRoles } from "../utils/auth";

const router = Router();

router.get("/api/journal-vouchers", listJournalVouchers);
router.get("/api/journal-vouchers/next-number", getNextJournalNumber);
router.get("/api/journal-vouchers/:id", getJournalVoucher);
router.post(
  "/api/journal-vouchers",
  requireRoles(["admin", "manager", "accountant", "operator"]),
  createJournalVoucher,
);
router.patch(
  "/api/journal-vouchers/:id",
  requireRoles(["admin", "manager", "accountant", "operator"]),
  updateJournalVoucher,
);
router.post(
  "/api/journal-vouchers/:id/approve",
  requireRoles(["admin", "manager", "accountant", "operator"]),
  approveJournalVoucher,
);
router.delete(
  "/api/journal-vouchers/:id",
  requireRoles(["admin", "manager"]),
  deleteJournalVoucher,
);

export default router;
