import { Router } from "express";
import {
  createProduct,
  deleteProduct,
  getProduct,
  listProducts,
  updateProduct,
} from "../controllers/products.controller";

const router = Router();

router.get("/api/products", listProducts);
router.get("/api/products/:id", getProduct);
router.post("/api/products", createProduct);
router.patch("/api/products/:id", updateProduct);
router.delete("/api/products/:id", deleteProduct);

export default router;
