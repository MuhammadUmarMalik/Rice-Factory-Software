import { Router } from "express";
import { createSale, deleteSale, getSale, listSales, updateSale } from "../controllers/sales.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/sales", requireRoles(Roles.sales), listSales);
router.get("/api/sales/:id", requireRoles(Roles.sales), getSale);
router.post("/api/sales", requireRoles(Roles.sales), createSale);
router.patch("/api/sales/:id", requireRoles(Roles.sales), updateSale);
router.delete("/api/sales/:id", requireRoles(Roles.sales), deleteSale);

export default router;
