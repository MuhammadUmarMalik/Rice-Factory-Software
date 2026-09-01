import { Router } from "express";
import { getSummary, getTransactions } from "../controllers/cash.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/cash/summary", requireRoles(Roles.finance), getSummary);
router.get("/api/cash/transactions", requireRoles(Roles.finance), getTransactions);

export default router;
