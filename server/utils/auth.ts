export function getUserRole(req: any): string {
  const role = (req.headers?.["x-user-role"] as string | undefined) || "";
  return role.toLowerCase() || "operator";
}

export function getUserId(req: any): number | undefined {
  const raw = req.headers?.["x-user-id"];
  if (!raw) return undefined;
  const n = typeof raw == "string" ? parseInt(raw, 10) : Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export function requireRoles(allowed: string[]) {
  const allow = allowed.map((r) => r.toLowerCase());
  return (req: any, res: any, next: any) => {
    const role = getUserRole(req);
    if (!allow.includes(role)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}
