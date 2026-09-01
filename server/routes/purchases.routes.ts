import { Router } from "express";
import {
  createPurchase,
  deletePurchase,
  getNextBillNumber,
  getPurchase,
  listPurchases,
  updatePurchase,
} from "../controllers/purchases.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/purchases/next-bill-number", requireRoles(Roles.purchasing), getNextBillNumber);
router.get("/api/purchases", requireRoles(Roles.purchasing), listPurchases);
router.get("/api/purchases/:id", requireRoles(Roles.purchasing), getPurchase);
router.post("/api/purchases", requireRoles(Roles.purchasing), createPurchase);
router.patch("/api/purchases/:id", requireRoles(Roles.purchasing), updatePurchase);
router.delete("/api/purchases/:id", requireRoles(Roles.purchasing), deletePurchase);

export default router;
