import { Router } from "express";
import {
  cancelGatePass,
  completeGatePass,
  createGatePass,
  getGatePass,
  getGatePassDashboard,
  getSaleDispatchSummary,
  listGatePasses,
} from "../controllers/gate-passes.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

// `/dashboard` is declared before `/:id` so it is not captured as an id.
router.get("/api/gate-passes", requireRoles(Roles.all), listGatePasses);
router.get("/api/gate-passes/dashboard", requireRoles(Roles.all), getGatePassDashboard);
router.get("/api/gate-passes/:id", requireRoles(Roles.all), getGatePass);

router.post("/api/gate-passes", requireRoles(Roles.ops), createGatePass);
router.post("/api/gate-passes/:id/complete", requireRoles(Roles.ops), completeGatePass);
// Cancelling is a bookkeeping override and is restricted to owners/managers.
router.post("/api/gate-passes/:id/cancel", requireRoles(Roles.settings), cancelGatePass);

router.get("/api/sales/:id/dispatch-summary", requireRoles(Roles.all), getSaleDispatchSummary);

export default router;
