import { Router } from "express";
import { createExpenseHandler, listExpensesHandler } from "../controllers/expenses.controller";

const router = Router();

router.get("/api/expenses", listExpensesHandler);
router.post("/api/expenses", createExpenseHandler);

export default router;
