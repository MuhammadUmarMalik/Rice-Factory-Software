import { storage } from "../models/storage";

type NotificationInput = {
  title: string;
  message?: string;
  type?: string;
  entityType?: string;
  entityId?: number;
  roles?: string[];
};

export async function notifyUsers(input: NotificationInput) {
  const users = await storage.getUsers();
  const roleFilter = input.roles?.map((r) => r.toLowerCase());
  const targets = users.filter((u) => u.isActive && (!roleFilter || roleFilter.includes(u.role.toLowerCase())));
  await Promise.all(
    targets.map((u) =>
      storage.createNotification({
        userId: u.id,
        title: input.title,
        message: input.message,
        type: input.type,
        entityType: input.entityType,
        entityId: input.entityId,
        isRead: false,
      }),
    ),
  );
}

export async function notifyLowStock(productId: number) {
  const product = await storage.getProduct(productId);
  if (!product) return;
  const threshold = Number(process.env.LOW_STOCK_THRESHOLD || "10");
  const current = Number(product.currentStock || "0");
  if (!Number.isFinite(current) || current > threshold) return;

  await notifyUsers({
    title: "Low stock alert",
    message: `${product.name} is low (${current} ${product.unit || "units"}).`,
    type: "low_stock",
    entityType: "product",
    entityId: product.id,
  });
}
