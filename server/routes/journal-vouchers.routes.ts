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
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/journal-vouchers", requireRoles(Roles.finance), listJournalVouchers);
router.get("/api/journal-vouchers/next-number", requireRoles(Roles.finance), getNextJournalNumber);
router.get("/api/journal-vouchers/:id", requireRoles(Roles.finance), getJournalVoucher);
router.post(
  "/api/journal-vouchers",
  requireRoles(Roles.finance),
  createJournalVoucher,
);
router.patch(
  "/api/journal-vouchers/:id",
  requireRoles(Roles.finance),
  updateJournalVoucher,
);
router.post(
  "/api/journal-vouchers/:id/approve",
  requireRoles(Roles.finance),
  approveJournalVoucher,
);
router.delete(
  "/api/journal-vouchers/:id",
  requireRoles(Roles.settings),
  deleteJournalVoucher,
);

export default router;
