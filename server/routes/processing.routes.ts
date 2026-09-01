import { Router } from "express";
import {
  addProcessingOutput,
  completeProcessing,
  createProcessing,
  deleteProcessingOutput,
  getProcessing,
  listProcessing,
  listProcessingOutputs,
  replaceProcessingOutputs,
  startProcessing,
  updateProcessing,
  updateProcessingOutput,
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

router.get("/api/processing/:id/outputs", requireRoles(Roles.ops), listProcessingOutputs);
router.put("/api/processing/:id/outputs", requireRoles(Roles.ops), replaceProcessingOutputs);
router.post("/api/processing/:id/outputs", requireRoles(Roles.ops), addProcessingOutput);
router.patch("/api/processing/:id/outputs/:outputId", requireRoles(Roles.ops), updateProcessingOutput);
router.delete("/api/processing/:id/outputs/:outputId", requireRoles(Roles.ops), deleteProcessingOutput);

export default router;
