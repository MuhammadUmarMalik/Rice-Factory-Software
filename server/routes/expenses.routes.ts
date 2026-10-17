import { Router } from "express";
import {
  createExpenseHandler,
  deleteExpenseHandler,
  listExpensesHandler,
  updateExpenseHandler,
  listExpenseCategoriesHandler,
  createExpenseCategoryHandler,
  updateExpenseCategoryHandler,
  deleteExpenseCategoryHandler,
} from "../controllers/expenses.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/expenses", requireRoles(Roles.finance), listExpensesHandler);
router.post("/api/expenses", requireRoles(Roles.finance), createExpenseHandler);
router.patch("/api/expenses/:id", requireRoles(Roles.finance), updateExpenseHandler);
router.delete("/api/expenses/:id", requireRoles(Roles.finance), deleteExpenseHandler);

// Expense category management
router.get("/api/expenses/categories", requireRoles(Roles.finance), listExpenseCategoriesHandler);
router.post("/api/expenses/categories", requireRoles(Roles.finance), createExpenseCategoryHandler);
router.patch("/api/expenses/categories/:id", requireRoles(Roles.finance), updateExpenseCategoryHandler);
router.delete("/api/expenses/categories/:id", requireRoles(Roles.finance), deleteExpenseCategoryHandler);

export default router;
