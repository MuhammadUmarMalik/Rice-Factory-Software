import type { Request, Response, NextFunction } from "express";
import { Server as IOServer } from "socket.io";
import type { Server as HttpServer } from "http";
import { verifyBearerToken } from "./auth";
import type { AuthUser } from "./auth";

export type RealtimeEntity =
  | "accounts"
  | "sales"
  | "purchases"
  | "receipts"
  | "payments"
  | "expenses"
  | "journal-vouchers"
  | "payrolls"
  | "employees"
  | "products"
  | "processing"
  | "cash"
  | "ledger"
  | "dashboard"
  | "reports"
  | "settings"
  | "users"
  | "notifications";

export type RealtimeEvent = {
  entity: RealtimeEntity;
  action: "created" | "updated" | "deleted";
  id?: number;
  at: string;
};

let io: IOServer | null = null;
let connectionCount = 0;

export type { AuthUser as RealtimeAuthUser };

export function initRealtime(httpServer: HttpServer): IOServer {
  if (io) return io;

  const isProduction = process.env.NODE_ENV === "production";
  const corsOrigins = (process.env.CORS_ORIGIN || "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  const origin: boolean | string | string[] = isProduction
    ? corsOrigins.length ? corsOrigins : true
    : true;

  io = new IOServer(httpServer, {
    path: "/api/socket.io",
    cors: { origin, credentials: true },
    connectionStateRecovery: { maxDisconnectionDuration: 2 * 60 * 1000 },
  });

  io.use((socket, next) => {
    const handshakeAuth = socket.handshake.auth;
    const token =
      handshakeAuth && typeof handshakeAuth === "object" && "token" in handshakeAuth
        ? String((handshakeAuth as { token?: string }).token ?? "")
        : "";
    const user: AuthUser | null = token ? verifyBearerToken(`Bearer ${token}`) : null;
    if (!user) {
      return next(new Error("unauthorized"));
    }
    (socket as unknown as { data: { user: AuthUser } }).data.user = user;
    next();
  });

  io.on("connection", (socket) => {
    connectionCount += 1;
    socket.on("disconnect", () => {
      connectionCount -= 1;
    });
  });

  return io;
}

export function getActiveConnectionCount(): number {
  return connectionCount;
}

export function publish(event: RealtimeEvent) {
  const payload: RealtimeEvent = { ...event, at: event.at || new Date().toISOString() };
  io?.emit("data:changed", payload);
}

export function publishEntities(entities: RealtimeEntity[], action: RealtimeEvent["action"], id?: number) {
  const at = new Date().toISOString();
  for (const entity of entities) {
    publish({ entity, action, id, at });
  }
}

export const realtimeEntities: Record<string, RealtimeEntity[]> = {
  "/api/accounts": ["accounts", "ledger", "dashboard", "reports"],
  "/api/sales": ["sales", "products", "accounts", "dashboard", "cash", "ledger", "reports"],
  "/api/purchases": ["purchases", "products", "accounts", "dashboard", "cash", "ledger", "reports"],
  "/api/receipts": ["receipts", "sales", "accounts", "dashboard", "cash", "payments", "ledger", "reports"],
  "/api/payments": ["payments", "purchases", "accounts", "dashboard", "cash", "receipts", "ledger", "reports"],
  "/api/expenses": ["expenses", "accounts", "dashboard", "cash", "ledger", "reports"],
  "/api/journal-vouchers": ["journal-vouchers", "payrolls", "accounts", "dashboard", "cash", "ledger", "reports"],
  "/api/payrolls": ["payrolls", "employees", "journal-vouchers", "accounts", "dashboard", "cash", "ledger", "reports"],
  "/api/employees": ["employees", "payrolls", "reports"],
  "/api/products": ["products", "dashboard", "reports"],
  "/api/processing": ["processing", "products", "dashboard", "ledger", "reports"],
  // Cash in Hand writes go through the same CR/CP vouchers the Receipts and
  // Payments screens list, so a change here has to redraw those too.
  "/api/cash": ["cash", "receipts", "payments", "accounts", "dashboard", "ledger", "reports"],
  "/api/ledger": ["ledger", "dashboard", "reports"],
  "/api/dashboard": ["dashboard", "reports"],
  "/api/reports": ["reports"],
  "/api/financial": ["reports"],
  "/api/fiscal-years": ["settings"],
  "/api/fiscal-periods": ["settings"],
  "/api/period-locks": ["settings"],
  "/api/daybooks": ["reports", "cash", "ledger"],
  "/api/settings": ["settings"],
  "/api/data": [
    "settings",
    "reports",
    "accounts",
    "sales",
    "purchases",
    "receipts",
    "payments",
    "expenses",
    "journal-vouchers",
    "payrolls",
    "employees",
    "products",
    "processing",
    "cash",
    "ledger",
    "dashboard",
    "users",
    "notifications",
  ],
  "/api/users": ["users"],
  "/api/notifications": ["notifications"],
};

export function resolveEntities(path: string): RealtimeEntity[] | null {
  const exact = realtimeEntities[path];
  if (exact) return exact;
  let best: { prefix: string; entities: RealtimeEntity[] } | null = null;
  for (const [prefix, entities] of Object.entries(realtimeEntities)) {
    if (path.startsWith(prefix + "/")) {
      if (!best || prefix.length > best.prefix.length) {
        best = { prefix, entities };
      }
    }
  }
  return best ? best.entities : null;
}

export function realtimeMiddleware(req: Request, res: Response, next: NextFunction) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return next();
  }

  const rawPath = (req.originalUrl || req.url || "").split("?")[0];
  const entities = resolveEntities(rawPath);
  if (!entities || entities.length === 0) {
    return next();
  }

  res.on("finish", () => {
    if (res.statusCode < 200 || res.statusCode >= 300) return;
    const action: RealtimeEvent["action"] =
      res.statusCode === 201 ? "created" : req.method === "DELETE" ? "deleted" : "updated";
    const idMatch = /\/(\d+)(?:\/|$)/.exec(rawPath);
    const id = idMatch ? Number(idMatch[1]) : undefined;
    publishEntities(entities, action, id);
  });

  next();
}
