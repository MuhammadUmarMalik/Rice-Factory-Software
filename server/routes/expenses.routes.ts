import { Router } from "express";
import { createExpenseHandler, listExpensesHandler } from "../controllers/expenses.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/expenses", requireRoles(Roles.finance), listExpensesHandler);
router.post("/api/expenses", requireRoles(Roles.finance), createExpenseHandler);

export default router;
