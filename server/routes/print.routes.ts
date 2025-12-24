import { Router } from "express";
import { previewHandler, pdfHandler } from "../controllers/print.controller";
import { requireRoles } from "../utils/auth";

const router = Router();
const allowed = ["admin", "manager", "accountant", "operator", "hr"];

router.post("/api/print/preview", requireRoles(allowed), previewHandler);
router.post("/api/print/pdf", requireRoles(allowed), pdfHandler);

export default router;
