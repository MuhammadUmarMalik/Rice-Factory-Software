import { Router } from "express";
import { getAlerts, getCharts, getRecent, getStats, getSummary } from "../controllers/dashboard.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/dashboard/stats", requireRoles(Roles.all), getStats);
router.get("/api/dashboard/recent", requireRoles(Roles.all), getRecent);
router.get("/api/dashboard/charts", requireRoles(Roles.all), getCharts);
router.get("/api/dashboard/summary", requireRoles(Roles.all), getSummary);
router.get("/api/dashboard/alerts", requireRoles(Roles.all), getAlerts);

export default router;
