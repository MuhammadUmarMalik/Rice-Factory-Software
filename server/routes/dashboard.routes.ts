import { Router } from "express";
import { getCharts, getRecent, getStats } from "../controllers/dashboard.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/dashboard/stats", requireRoles(Roles.all), getStats);
router.get("/api/dashboard/recent", requireRoles(Roles.all), getRecent);
router.get("/api/dashboard/charts", requireRoles(Roles.all), getCharts);

export default router;
