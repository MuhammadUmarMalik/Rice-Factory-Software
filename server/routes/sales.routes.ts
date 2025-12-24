import { Router } from "express";
import { createSale, getSale, listSales } from "../controllers/sales.controller";

const router = Router();

router.get("/api/sales", listSales);
router.get("/api/sales/:id", getSale);
router.post("/api/sales", createSale);

export default router;
