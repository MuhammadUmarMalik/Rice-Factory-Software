import { Router } from "express";
import { createAccount, getAccount, listAccounts, updateAccount } from "../controllers/accounts.controller";

const router = Router();

router.get("/api/accounts", listAccounts);
router.get("/api/accounts/:id", getAccount);
router.post("/api/accounts", createAccount);
router.patch("/api/accounts/:id", updateAccount);

export default router;
