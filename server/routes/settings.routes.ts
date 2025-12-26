import { Router } from "express";
import { getSettings, saveSettings } from "../controllers/settings.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/settings", requireRoles(Roles.all), getSettings);
router.post("/api/settings", requireRoles(Roles.settings), saveSettings);

export default router;
