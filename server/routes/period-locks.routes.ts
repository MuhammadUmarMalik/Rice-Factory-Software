import { Router } from "express";
import { createPeriodLock, deletePeriodLock, listPeriodLocks } from "../controllers/period-locks.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/period-locks", requireRoles(Roles.settings), listPeriodLocks);
router.post("/api/period-locks", requireRoles(Roles.settings), createPeriodLock);
router.delete("/api/period-locks/:id", requireRoles(Roles.settings), deletePeriodLock);

export default router;
