import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../controllers/products.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/products", requireRoles(Roles.ops), listProducts);
router.get("/api/products/:id", requireRoles(Roles.ops), getProduct);
router.post("/api/products", requireRoles(Roles.ops), createProduct);
router.patch("/api/products/:id", requireRoles(Roles.ops), updateProduct);
router.delete("/api/products/:id", requireRoles(Roles.ops), deleteProduct);

export default router;
