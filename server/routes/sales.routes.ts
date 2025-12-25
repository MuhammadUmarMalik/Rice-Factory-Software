import { Router } from "express";
import { createSale, getSale, listSales } from "../controllers/sales.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/sales", requireRoles(Roles.sales), listSales);
router.get("/api/sales/:id", requireRoles(Roles.sales), getSale);
router.post("/api/sales", requireRoles(Roles.sales), createSale);

export default router;
