import { Router } from "express";
import { bootstrapAdmin, login, logout, me } from "../controllers/auth.controller";
import { authenticate } from "../utils/auth";

const router = Router();

router.post("/api/auth/login", login);
router.post("/api/auth/logout", logout);
router.get("/api/auth/me", authenticate, me);
router.post("/api/auth/bootstrap", bootstrapAdmin);

export default router;
