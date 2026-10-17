import { Router } from "express";
import { listAuditLogs } from "../controllers/audit-logs.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/audit-logs", requireRoles(Roles.settings), listAuditLogs);

export default router;
