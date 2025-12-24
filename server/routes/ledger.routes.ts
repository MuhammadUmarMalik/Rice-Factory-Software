import { Router } from "express";
import { getLedger } from "../controllers/ledger.controller";

const router = Router();

router.get("/api/ledger", getLedger);

export default router;
