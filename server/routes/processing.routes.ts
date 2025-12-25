import { Router } from "express";
import {
  completeProcessing,
  createProcessing,
  getProcessing,
  listProcessing,
  startProcessing,
  updateProcessing,
} from "../controllers/processing.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/processing", requireRoles(Roles.ops), listProcessing);
router.get("/api/processing/:id", requireRoles(Roles.ops), getProcessing);
router.post("/api/processing", requireRoles(Roles.ops), createProcessing);
router.patch("/api/processing/:id", requireRoles(Roles.ops), updateProcessing);
router.patch("/api/processing/:id/start", requireRoles(Roles.ops), startProcessing);
router.patch("/api/processing/:id/complete", requireRoles(Roles.ops), completeProcessing);

export default router;
