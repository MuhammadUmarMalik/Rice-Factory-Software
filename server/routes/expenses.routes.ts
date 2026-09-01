import { Router } from "express";
import { createExpenseHandler, deleteExpenseHandler, listExpensesHandler, updateExpenseHandler } from "../controllers/expenses.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/expenses", requireRoles(Roles.finance), listExpensesHandler);
router.post("/api/expenses", requireRoles(Roles.finance), createExpenseHandler);
router.patch("/api/expenses/:id", requireRoles(Roles.finance), updateExpenseHandler);
router.delete("/api/expenses/:id", requireRoles(Roles.finance), deleteExpenseHandler);

export default router;
