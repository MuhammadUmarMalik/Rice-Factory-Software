import { Router } from "express";
import {
  exportDatabaseHandler,
  getAppVersionHandler,
  getDataSummaryHandler,
  importDatabaseHandler,
} from "../controllers/data-management.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/data/summary", requireRoles(Roles.settings), getDataSummaryHandler);
router.get("/api/data/export", requireRoles(Roles.settings), exportDatabaseHandler);
router.post("/api/data/import", requireRoles(Roles.adminOnly), importDatabaseHandler);
router.get("/api/system/version", requireRoles(Roles.all), getAppVersionHandler);

export default router;
