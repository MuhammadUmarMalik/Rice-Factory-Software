import { useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useAuthStore } from "@/stores/auth.store";
import { invalidateApi, invalidateAllApi, invalidationGroups } from "@/api/invalidation";

type RealtimeEvent = {
  entity: string;
  action: "created" | "updated" | "deleted";
  id?: number;
  at: string;
};

const ENTITY_GROUPS: Record<string, readonly string[]> = {
  accounts: invalidationGroups.accounts,
  sales: invalidationGroups.sales,
  purchases: invalidationGroups.purchases,
  receipts: invalidationGroups.receipts,
  payments: invalidationGroups.payments,
  expenses: invalidationGroups.expenses,
  "journal-vouchers": invalidationGroups.journal,
  payrolls: invalidationGroups.payroll,
  employees: invalidationGroups.employees,
  products: invalidationGroups.products,
  processing: invalidationGroups.processing,
  cash: invalidationGroups.cash,
  ledger: invalidationGroups.ledger,
  dashboard: invalidationGroups.dashboard,
  reports: [
    "/api/reports",
    "/api/financial",
    "/api/reports/sales",
    "/api/reports/purchases",
    "/api/reports/stock",
    "/api/reports/trial-balance",
    "/api/reports/profit-loss",
    "/api/reports/gross-profit",
    "/api/reports/day-book",
    "/api/reports/outstanding-customers",
    "/api/reports/outstanding-suppliers",
    "/api/reports/bardana",
    "/api/reports/less",
    "/api/reports/period-sales",
    "/api/reports/period-purchases",
    "/api/reports/salary-account",
  ],
  settings: invalidationGroups.settings,
  users: invalidationGroups.users,
  notifications: invalidationGroups.notifications,
};

function resolvePrefixes(entity: string): readonly string[] | undefined {
  return ENTITY_GROUPS[entity];
}

const DEBOUNCE_MS = 120;

export function useRealtime() {
  const token = useAuthStore((state) => state.token);
  const [connected, setConnected] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!token) {
      socketRef.current?.close();
      socketRef.current = null;
      setConnected(false);
      if (flushTimerRef.current) {
        clearTimeout(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      return;
    }

    const socket = io({
      path: "/api/socket.io",
      // Send the JWT over the Socket.IO handshake so every window (including ones
      // that only have a session cookie) can authenticate the WebSocket.
      auth: { token },
      // Polling first keeps the handshake working behind the Vite dev proxy
      // (which forwards HTTP); Socket.IO upgrades to WebSocket when available.
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30_000,
      randomizationFactor: 0.5,
      timeout: 10_000,
    });
    socketRef.current = socket;

    const flush = () => {
      const prefixes = Array.from(pendingRef.current);
      pendingRef.current = new Set();
      flushTimerRef.current = null;
      if (prefixes.length > 0) {
        invalidateApi(prefixes);
      }
    };

    const scheduleFlush = () => {
      if (flushTimerRef.current) return;
      flushTimerRef.current = setTimeout(flush, DEBOUNCE_MS);
    };

    const onDataChanged = (payload: RealtimeEvent) => {
      const prefixes = resolvePrefixes(payload?.entity);
      if (prefixes && prefixes.length > 0) {
        for (const p of prefixes) pendingRef.current.add(p);
        scheduleFlush();
      }
    };

    let wasConnected = false;
    socket.on("connect", () => {
      if (wasConnected) {
        // Reconnect: flush pending debounce and refetch everything we may have missed
        pendingRef.current.clear();
        if (flushTimerRef.current) {
          clearTimeout(flushTimerRef.current);
          flushTimerRef.current = null;
        }
        invalidateAllApi();
      }
      wasConnected = true;
      setConnected(true);
    });
    socket.on("disconnect", () => setConnected(false));
    socket.on("data:changed", onDataChanged);

    return () => {
      if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
      pendingRef.current = new Set();
      socket.off("connect");
      socket.off("disconnect");
      socket.off("data:changed", onDataChanged);
      socket.close();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  return { connected };
}

export default useRealtime;
