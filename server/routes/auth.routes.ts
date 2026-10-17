import { Router } from "express";
import { bootstrapAdmin, login, logout, me, setupStatus } from "../controllers/auth.controller";
import { authenticate } from "../utils/auth";

const router = Router();

router.post("/api/auth/login", login);
router.post("/api/auth/logout", logout);
router.get("/api/auth/me", authenticate, me);
router.post("/api/auth/bootstrap", bootstrapAdmin);
router.get("/api/auth/setup-status", setupStatus);

export default router;
