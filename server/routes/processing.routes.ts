import { Router } from "express";
import {
  completeProcessing,
  createProcessing,
  getProcessing,
  listProcessing,
  startProcessing,
  updateProcessing,
} from "../controllers/processing.controller";

const router = Router();

router.get("/api/processing", listProcessing);
router.get("/api/processing/:id", getProcessing);
router.post("/api/processing", createProcessing);
router.patch("/api/processing/:id", updateProcessing);
router.patch("/api/processing/:id/start", startProcessing);
router.patch("/api/processing/:id/complete", completeProcessing);

export default router;
