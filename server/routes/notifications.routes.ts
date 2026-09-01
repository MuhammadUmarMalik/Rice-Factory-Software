import { Router } from "express";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../controllers/notifications.controller";
import { requireRoles } from "../utils/auth";
import { Roles } from "../utils/roles";

const router = Router();

router.get("/api/notifications", requireRoles(Roles.all), listNotifications);
router.post("/api/notifications/read-all", requireRoles(Roles.all), markAllNotificationsRead);
router.patch("/api/notifications/:id/read", requireRoles(Roles.all), markNotificationRead);

export default router;
