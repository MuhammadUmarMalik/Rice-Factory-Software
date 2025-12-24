import { Router } from "express";
import { getSummary, getTransactions } from "../controllers/cash.controller";

const router = Router();

router.get("/api/cash/summary", getSummary);
router.get("/api/cash/transactions", getTransactions);

export default router;
