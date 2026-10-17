import { Router } from "express";
import { createCheque, deleteCheque, listCheques, updateChequeStatus } from "../controllers/cheques.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/cheques", requireRoles(Roles.finance), listCheques);
router.post("/api/cheques", requireRoles(Roles.finance), createCheque);
router.patch("/api/cheques/:id/status", requireRoles(Roles.finance), updateChequeStatus);
router.delete("/api/cheques/:id", requireRoles(Roles.finance), deleteCheque);

export default router;
