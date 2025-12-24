import { Router } from "express";
import { getSettings, saveSettings } from "../controllers/settings.controller";

const router = Router();

router.get("/api/settings", getSettings);
router.post("/api/settings", saveSettings);

export default router;
