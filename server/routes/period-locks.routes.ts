import { Router } from "express";
import { createPeriodLock, deletePeriodLock, listPeriodLocks } from "../controllers/period-locks.controller";
import { requireRoles } from "../utils/auth";

const router = Router();

router.get("/api/period-locks", requireRoles(["admin", "manager"]), listPeriodLocks);
router.post("/api/period-locks", requireRoles(["admin", "manager"]), createPeriodLock);
router.delete("/api/period-locks/:id", requireRoles(["admin", "manager"]), deletePeriodLock);

export default router;
