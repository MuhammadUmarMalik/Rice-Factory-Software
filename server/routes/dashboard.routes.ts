import { Router } from "express";
import { getAlerts, getCharts, getRecent, getStats, getSummary } from "../controllers/dashboard.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";
import { cacheResponse } from "../utils/response-cache";

const router = Router();

const dashboardCache = cacheResponse({ ttlMs: 15000, keyPrefix: "dashboard" });

router.get("/api/dashboard/stats", requireRoles(Roles.all), dashboardCache, getStats);
router.get("/api/dashboard/recent", requireRoles(Roles.all), dashboardCache, getRecent);
router.get("/api/dashboard/charts", requireRoles(Roles.all), dashboardCache, getCharts);
router.get("/api/dashboard/summary", requireRoles(Roles.all), dashboardCache, getSummary);
router.get("/api/dashboard/alerts", requireRoles(Roles.all), dashboardCache, getAlerts);

export default router;
