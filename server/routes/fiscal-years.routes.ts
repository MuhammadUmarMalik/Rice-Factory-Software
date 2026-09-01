import { Router } from "express";
import {
  listFiscalYears,
  listFiscalPeriods,
  createFiscalYear,
  updateFiscalYearStatus,
  updateFiscalPeriodClosed,
} from "../controllers/fiscal-years.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/fiscal-years", requireRoles(Roles.settings), listFiscalYears);
router.get("/api/fiscal-years/:id/periods", requireRoles(Roles.settings), listFiscalPeriods);
router.post("/api/fiscal-years", requireRoles(Roles.settings), createFiscalYear);
router.patch("/api/fiscal-years/:id/status", requireRoles(Roles.settings), updateFiscalYearStatus);
router.patch("/api/fiscal-periods/:id", requireRoles(Roles.settings), updateFiscalPeriodClosed);

export default router;
