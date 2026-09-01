import { Router } from "express";
import { createAccount, deleteAccount, getAccount, listAccounts, updateAccount } from "../controllers/accounts.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/accounts", requireRoles(Roles.finance), listAccounts);
router.get("/api/accounts/:id", requireRoles(Roles.finance), getAccount);
router.post("/api/accounts", requireRoles(Roles.finance), createAccount);
router.patch("/api/accounts/:id", requireRoles(Roles.finance), updateAccount);
router.delete("/api/accounts/:id", requireRoles(Roles.finance), deleteAccount);

export default router;
