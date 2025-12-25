import { Router } from "express";
import { previewHandler, pdfHandler } from "../controllers/print.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();
const allowed = Roles.all;

router.post("/api/print/preview", requireRoles(allowed), previewHandler);
router.post("/api/print/pdf", requireRoles(allowed), pdfHandler);

export default router;
