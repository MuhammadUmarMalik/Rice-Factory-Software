export const Roles = {
  all: ["admin", "manager", "accountant", "hr", "operator"],
  finance: ["admin", "manager", "accountant"],
  hr: ["admin", "manager", "hr"],
  ops: ["admin", "manager", "operator"],
  sales: ["admin", "manager", "accountant", "operator"],
  purchasing: ["admin", "manager", "accountant", "operator"],
  settings: ["admin", "manager"],
  adminOnly: ["admin"],
} as const;

export type Role = (typeof Roles.all)[number];

export const readProductsRoles = [...new Set([...Roles.sales, ...Roles.purchasing])];
export const readAccountsRoles = readProductsRoles;
export const readPayrollRoles = ["admin", "manager", "hr", "accountant"];

export function can(role: string | undefined, allowed: readonly string[]): boolean {
  return role ? allowed.includes(role) : false;
}
