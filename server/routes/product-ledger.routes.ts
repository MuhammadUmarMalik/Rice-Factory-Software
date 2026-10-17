import { Router } from "express";
import { getProductLedgerReport } from "../controllers/product-ledger.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get(
  "/api/reports/product-ledger",
  requireRoles(Roles.purchasing),
  getProductLedgerReport,
);

export default router;
