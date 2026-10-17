import { useState } from "react";
import { Link, useLocation } from "wouter";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard";
import Users from "lucide-react/dist/esm/icons/users";
import Package from "lucide-react/dist/esm/icons/package";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart";
import Cog from "lucide-react/dist/esm/icons/cog";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import History from "lucide-react/dist/esm/icons/history";
import FileText from "lucide-react/dist/esm/icons/file-text";
import Factory from "lucide-react/dist/esm/icons/factory";
import TrendingUp from "lucide-react/dist/esm/icons/trending-up";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import LogOut from "lucide-react/dist/esm/icons/log-out";
import Wheat from "lucide-react/dist/esm/icons/wheat";
import Receipt from "lucide-react/dist/esm/icons/receipt";
import Wallet from "lucide-react/dist/esm/icons/wallet";
import UserRound from "lucide-react/dist/esm/icons/user-round";
import ReceiptText from "lucide-react/dist/esm/icons/receipt-text";
import Truck from "lucide-react/dist/esm/icons/truck";
import HandCoins from "lucide-react/dist/esm/icons/hand-coins";
import ChartColumn from "lucide-react/dist/esm/icons/chart-column";
import BookOpen from "lucide-react/dist/esm/icons/book-open";
import Scale from "lucide-react/dist/esm/icons/scale";
import Landmark from "lucide-react/dist/esm/icons/landmark";
import FileSpreadsheet from "lucide-react/dist/esm/icons/file-spreadsheet";
import Banknote from "lucide-react/dist/esm/icons/banknote";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useLanguage } from "@/contexts/language-context";
import { useAuthStore } from "@/stores/auth.store";
import { apiRequest } from "@/lib/queryClient";
import { Roles, can, readAccountsRoles, readPayrollRoles, readProductsRoles } from "@/lib/roles";

// Grouped so the 11 top-level links scan as three short sections instead of one long list.
const mainMenuGroups = [
  {
    label: "menu",
    items: [{ title: "dashboard", url: "/", icon: LayoutDashboard, roles: Roles.all }],
  },
  {
    label: "operations",
    items: [
      { title: "purchases", url: "/purchases", icon: ShoppingCart, roles: Roles.purchasing },
      { title: "processing", url: "/processing", icon: Factory, roles: Roles.ops },
      { title: "sales", url: "/sales", icon: TrendingUp, roles: Roles.sales },
      { title: "gatePass", url: "/gate-passes", icon: Truck, roles: Roles.all },
      { title: "products", url: "/products", icon: Package, roles: readProductsRoles },
    ],
  },
  {
    label: "cashAndVouchers",
    items: [
      { title: "cashReceipts", url: "/receipts", icon: Receipt, roles: Roles.finance },
      { title: "cashPayments", url: "/payments", icon: HandCoins, roles: Roles.finance },
      { title: "chequeRegister", url: "/cheques", icon: ScrollText, roles: Roles.finance },
      { title: "expenses", url: "/expenses", icon: ReceiptText, roles: Roles.finance },
      { title: "cashInHand", url: "/cash", icon: Wallet, roles: Roles.finance },
      { title: "journalVoucher", url: "/journal", icon: FileText, roles: Roles.finance },
    ],
  },
];

const accountsSubmenu = [
  { title: "customers", url: "/accounts/customers", roles: readAccountsRoles },
  { title: "suppliers", url: "/accounts/suppliers", roles: readAccountsRoles },
  { title: "banks", url: "/accounts/banks", roles: readAccountsRoles },
];

const reportsSubmenuGroups = [
  {
    label: "stockAndTrading",
    icon: ChartColumn,
    items: [
      { title: "stockReport", url: "/reports/stock", roles: Roles.purchasing },
      { title: "purchaseReport", url: "/reports/purchases", roles: Roles.purchasing },
      { title: "bardanaReport", url: "/reports/bardana", roles: Roles.purchasing },
      { title: "lessReport", url: "/reports/less", roles: Roles.purchasing },
      { title: "recoveryReport", url: "/reports/recovery", roles: Roles.purchasing },
      { title: "salesReport", url: "/reports/sales", roles: Roles.sales },
      { title: "periodPurchases", url: "/reports/period-purchases", roles: Roles.finance },
      { title: "periodSales", url: "/reports/period-sales", roles: Roles.finance },
      { title: "grossProfit", url: "/reports/gross-profit", roles: Roles.finance },
    ],
  },
  {
    label: "dayBookGroup",
    icon: BookOpen,
    items: [
      { title: "dayBook", url: "/reports/day-book", roles: Roles.finance },
      { title: "dayBookSales", url: "/reports/day-book-sales", roles: Roles.finance },
      { title: "dayBookPurchases", url: "/reports/day-book-purchases", roles: Roles.finance },
      { title: "dayBookCash", url: "/reports/day-book-cash", roles: Roles.finance },
      { title: "dayBookSalesReturns", url: "/reports/day-book-sales-returns", roles: Roles.finance },
      { title: "dayBookPurchaseReturns", url: "/reports/day-book-purchase-returns", roles: Roles.finance },
    ],
  },
  {
    label: "receivablesPayables",
    icon: Scale,
    items: [
      { title: "outstandingCustomers", url: "/reports/outstanding-customers", roles: Roles.finance },
      { title: "outstandingSuppliers", url: "/reports/outstanding-suppliers", roles: Roles.finance },
    ],
  },
  {
    label: "cashAndLedger",
    icon: Landmark,
    items: [
      { title: "cashLedger", url: "/reports/cash-ledger", roles: Roles.finance },
      { title: "ledger", url: "/reports/ledger", roles: Roles.finance },
      { title: "productLedger", url: "/reports/product-ledger", roles: Roles.purchasing },
    ],
  },
  {
    label: "financialStatements",
    icon: FileSpreadsheet,
    items: [
      { title: "trialBalance", url: "/reports/trial-balance", roles: Roles.finance },
      { title: "profitLoss", url: "/reports/profit-loss", roles: Roles.finance },
      { title: "incomeStatement", url: "/reports/income-statement", roles: Roles.finance },
      { title: "balanceSheet", url: "/reports/balance-sheet", roles: Roles.finance },
      { title: "capitalAccount", url: "/reports/capital", roles: Roles.finance },
    ],
  },
  {
    label: "payroll",
    icon: Banknote,
    items: [{ title: "salaryAccount", url: "/reports/salary", roles: Roles.finance }],
  },
];

const hrSubmenu = [
  { title: "employees", url: "/hr/employees", roles: Roles.all },
  { title: "payroll", url: "/hr/payroll", roles: readPayrollRoles },
];

/** Every navigable page, flattened — feeds the header's jump-to-page search. */
export const allNavItems: { title: string; url: string; roles: readonly string[] }[] = [
  ...mainMenuGroups.flatMap((g): { title: string; url: string; roles: readonly string[] }[] => g.items),
  ...accountsSubmenu,
  ...reportsSubmenuGroups.flatMap((g) => g.items),
  ...hrSubmenu,
  { title: "settings", url: "/settings", roles: Roles.settings },
  { title: "auditLog", url: "/admin/audit-log", roles: Roles.settings },
  { title: "users", url: "/admin/users", roles: Roles.adminOnly },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { t, isRTL } = useLanguage();
  const user = useAuthStore((state) => state.user);
  const isAdmin = can(user?.role, Roles.adminOnly);
  const clearSession = useAuthStore((state) => state.logout);
  const [openReportGroups, setOpenReportGroups] = useState<Record<string, boolean>>({});

  const visibleMainGroups = mainMenuGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => can(user?.role, item.roles)) }))
    .filter((group) => group.items.length > 0);
  const visibleAccountsSubmenu = accountsSubmenu.filter((item) => can(user?.role, item.roles));
  const visibleReportsGroups = reportsSubmenuGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => can(user?.role, item.roles)) }))
    .filter((group) => group.items.length > 0);
  const visibleHrSubmenu = hrSubmenu.filter((item) => can(user?.role, item.roles));

  const initials = (() => {
    const name = user?.fullName || user?.username || "";
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "MM";
    if (parts.length === 1) return parts[0][0]?.toUpperCase() || "MM";
    return `${parts[0][0] || ""}${parts[1][0] || ""}`.toUpperCase();
  })();

  const handleLogout = async () => {
    try {
      await apiRequest("POST", "/api/auth/logout");
    } finally {
      clearSession();
      setLocation("/login");
    }
  };

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location === url || location.startsWith(`${url}/`);
  };

  const isGroupActive = (group: { items: { url: string }[] }) => group.items.some((item) => isActive(item.url));

  return (
    <nav aria-label="Primary">
      <Sidebar>
        <SidebarHeader className="p-4 border-b border-sidebar-border">
          <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
              <Wheat className="h-5 w-5" />
            </div>
            <div className={isRTL ? "text-right" : ""}>
              <h1 className={`text-base font-semibold ${isRTL ? "font-urdu" : ""}`}>{t("appTitle")}</h1>
              <p className={`text-xs text-muted-foreground ${isRTL ? "font-urdu" : ""}`}>{t("appSubtitle")}</p>
            </div>
          </div>
        </SidebarHeader>

        <SidebarContent className="hide-scrollbar px-2 py-2">
          {visibleMainGroups.map((group) => (
            <SidebarGroup key={group.label}>
              <SidebarGroupLabel className={isRTL ? "font-urdu text-right" : ""}>{t(group.label as any)}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton asChild isActive={isActive(item.url)} data-testid={`nav-${item.title}`}>
                        <Link href={item.url} className={isRTL ? "flex-row-reverse" : ""}>
                          <item.icon className="h-4 w-4" />
                          <span className={isRTL ? "font-urdu" : ""}>{t(item.title as any)}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          ))}
          {visibleReportsGroups.length > 0 && (
            <SidebarGroup>
              <SidebarGroupLabel className={isRTL ? "font-urdu text-right" : ""}>{t("reports")}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {visibleReportsGroups.map((group) => {
                    const active = isGroupActive(group);
                    return (
                      <Collapsible
                        key={group.label}
                        className="group/collapsible"
                        open={active || !!openReportGroups[group.label]}
                        onOpenChange={(open) => setOpenReportGroups((prev) => ({ ...prev, [group.label]: open }))}
                      >
                        <SidebarMenuItem>
                          <CollapsibleTrigger asChild>
                            <SidebarMenuButton className={isRTL ? "flex-row-reverse" : ""} data-active-group={active || undefined}>
                              <group.icon className={`h-4 w-4 ${active ? "text-primary" : ""}`} />
                              <span className={isRTL ? "font-urdu" : ""}>{t(group.label as any)}</span>
                              <span className={`${isRTL ? "mr-auto" : "ml-auto"} text-[10px] tabular-nums text-muted-foreground`}>
                                {group.items.length}
                              </span>
                              <ChevronDown className="h-4 w-4 shrink-0 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                            </SidebarMenuButton>
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <SidebarMenuSub>
                              {group.items.map((subItem) => (
                                <SidebarMenuSubItem key={subItem.title}>
                                  <SidebarMenuSubButton asChild isActive={isActive(subItem.url)} data-testid={`nav-${subItem.title}`}>
                                    <Link
                                      href={subItem.url}
                                      title={t(subItem.title as any)}
                                      className={isRTL ? "flex-row-reverse font-urdu min-w-0" : "min-w-0"}
                                    >
                                      <span>{t(subItem.title as any)}</span>
                                    </Link>
                                  </SidebarMenuSubButton>
                                </SidebarMenuSubItem>
                              ))}
                            </SidebarMenuSub>
                          </CollapsibleContent>
                        </SidebarMenuItem>
                      </Collapsible>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          )}
          <SidebarGroup>
            <SidebarGroupLabel className={isRTL ? "font-urdu text-right" : ""}>{t("management")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>

                {visibleAccountsSubmenu.length > 0 && (
                  <Collapsible defaultOpen className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className={isRTL ? "flex-row-reverse" : ""}>
                          <Users className="h-4 w-4" />
                          <span className={isRTL ? "font-urdu" : ""}>{t("accounts")}</span>
                          <ChevronDown className={`${isRTL ? "mr-auto" : "ml-auto"} h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {visibleAccountsSubmenu.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild isActive={isActive(subItem.url)} data-testid={`nav-${subItem.title}`}>
                                <Link
                                  href={subItem.url}
                                  title={t(subItem.title as any)}
                                  className={isRTL ? "flex-row-reverse font-urdu min-w-0" : "min-w-0"}
                                >
                                  <span>{t(subItem.title as any)}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {visibleHrSubmenu.length > 0 && (
                  <Collapsible className="group/collapsible">
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className={isRTL ? "flex-row-reverse" : ""}>
                          <UserRound className="h-4 w-4" />
                          <span className={isRTL ? "font-urdu" : ""}>{t("hrPayroll")}</span>
                          <ChevronDown className={`${isRTL ? "mr-auto" : "ml-auto"} h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {visibleHrSubmenu.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton asChild isActive={isActive(subItem.url)} data-testid={`nav-${subItem.title}`}>
                                <Link
                                  href={subItem.url}
                                  title={t(subItem.title as any)}
                                  className={isRTL ? "flex-row-reverse font-urdu min-w-0" : "min-w-0"}
                                >
                                  <span>{t(subItem.title as any)}</span>
                                </Link>
                              </SidebarMenuSubButton>
                            </SidebarMenuSubItem>
                          ))}
                        </SidebarMenuSub>
                      </CollapsibleContent>
                    </SidebarMenuItem>
                  </Collapsible>
                )}

                {can(user?.role, Roles.settings) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/settings")} data-testid="nav-settings">
                      <Link href="/settings" className={isRTL ? "flex-row-reverse" : ""}>
                        <Cog className="h-4 w-4" />
                        <span className={isRTL ? "font-urdu" : ""}>{t("settings")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {can(user?.role, Roles.settings) && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/admin/audit-log")} data-testid="nav-audit-log">
                      <Link href="/admin/audit-log" className={isRTL ? "flex-row-reverse" : ""}>
                        <History className="h-4 w-4" />
                        <span className={isRTL ? "font-urdu" : ""}>{t("auditLog")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
                {isAdmin && (
                  <SidebarMenuItem>
                    <SidebarMenuButton asChild isActive={isActive("/admin/users")} data-testid="nav-users">
                      <Link href="/admin/users" className={isRTL ? "flex-row-reverse" : ""}>
                        <Users className="h-4 w-4" />
                        <span className={isRTL ? "font-urdu" : ""}>{t("users")}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter className="p-4 border-t border-sidebar-border">
          <footer aria-label="Sidebar account" className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
            <Avatar className="h-9 w-9">
              <AvatarFallback className="bg-primary/10 text-primary text-sm">{initials}</AvatarFallback>
            </Avatar>
            <div className={`flex-1 ${isRTL ? "text-right" : ""}`}>
              <p className={`text-sm font-medium ${isRTL ? "font-urdu" : ""}`}>{user?.fullName || t("user")}</p>
              <p className="text-xs text-muted-foreground">{user?.username || ""}</p>
            </div>
            <SidebarMenuButton
              size="sm"
              className="h-8 w-8"
              data-testid="button-logout"
              onClick={handleLogout}
              aria-label={t("logout")}
            >
              <LogOut className="h-4 w-4" />
            </SidebarMenuButton>
          </footer>
        </SidebarFooter>
      </Sidebar>
    </nav>
  );
}
