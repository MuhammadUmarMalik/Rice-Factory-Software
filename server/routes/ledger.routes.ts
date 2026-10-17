import { Router } from "express";
import { getLedger, toggleCleared } from "../controllers/ledger.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/ledger", requireRoles(Roles.finance), getLedger);
router.patch("/api/ledger/:id/cleared", requireRoles(Roles.finance), toggleCleared);

export default router;
