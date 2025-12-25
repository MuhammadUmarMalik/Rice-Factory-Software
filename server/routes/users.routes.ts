import { Router } from "express";
import { createUser, listUsers, updateUser } from "../controllers/users.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/users", requireRoles(Roles.adminOnly), listUsers);
router.post("/api/users", requireRoles(Roles.adminOnly), createUser);
router.patch("/api/users/:id", requireRoles(Roles.adminOnly), updateUser);

export default router;
