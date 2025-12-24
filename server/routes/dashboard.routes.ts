import { Router } from "express";
import { getCharts, getRecent, getStats } from "../controllers/dashboard.controller";

const router = Router();

router.get("/api/dashboard/stats", getStats);
router.get("/api/dashboard/recent", getRecent);
router.get("/api/dashboard/charts", getCharts);

export default router;
