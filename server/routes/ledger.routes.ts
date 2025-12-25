import { Router } from "express";
import { getLedger } from "../controllers/ledger.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/ledger", requireRoles(Roles.finance), getLedger);

export default router;
