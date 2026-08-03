import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import LayoutDashboard from "lucide-react/dist/esm/icons/layout-dashboard";
import Users from "lucide-react/dist/esm/icons/users";
import Package from "lucide-react/dist/esm/icons/package";
import ShoppingCart from "lucide-react/dist/esm/icons/shopping-cart";
import Cog from "lucide-react/dist/esm/icons/cog";
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

const mainMenuItems = [
  { title: "dashboard", url: "/", icon: LayoutDashboard, roles: Roles.all },
  { title: "products", url: "/products", icon: Package, roles: readProductsRoles },
  { title: "purchases", url: "/purchases", icon: ShoppingCart, roles: Roles.purchasing },
  { title: "cashReceipts", url: "/receipts", icon: Receipt, roles: Roles.finance },
  { title: "cashPayments", url: "/payments", icon: Receipt, roles: Roles.finance },
  { title: "expenses", url: "/expenses", icon: ReceiptText, roles: Roles.finance },
  { title: "cashInHand", url: "/cash", icon: Wallet, roles: Roles.finance },
  { title: "journalVoucher", url: "/journal", icon: FileText, roles: Roles.finance },
  { title: "processing", url: "/processing", icon: Factory, roles: Roles.ops },
  { title: "sales", url: "/sales", icon: TrendingUp, roles: Roles.sales },
];

const accountsSubmenu = [
  { title: "customers", url: "/accounts/customers", roles: readAccountsRoles },
  { title: "suppliers", url: "/accounts/suppliers", roles: readAccountsRoles },
  { title: "banks", url: "/accounts/banks", roles: readAccountsRoles },
];

const reportsSubmenuGroups = [
  {
    label: "operations",
    items: [
      { title: "stockReport", url: "/reports/stock", roles: Roles.purchasing },
      { title: "purchaseReport", url: "/reports/purchases", roles: Roles.purchasing },
      { title: "bardanaReport", url: "/reports/bardana", roles: Roles.purchasing },
      { title: "lessReport", url: "/reports/less", roles: Roles.purchasing },
      { title: "salesReport", url: "/reports/sales", roles: Roles.sales },
      { title: "periodPurchases", url: "/reports/period-purchases", roles: Roles.finance },
      { title: "periodSales", url: "/reports/period-sales", roles: Roles.finance },
      { title: "grossProfit", url: "/reports/gross-profit", roles: Roles.finance },
    ],
  },
  {
    label: "dayBookGroup",
    items: [
      { title: "dayBook", url: "/reports/day-book", roles: Roles.finance },
      { title: "dayBookSales", url: "/reports/day-book-sales", roles: Roles.finance },
      { title: "dayBookPurchases", url: "/reports/day-book-purchases", roles: Roles.finance },
      { title: "dayBookCash", url: "/reports/day-book-cash", roles: Roles.finance },
      { title: "dayBookSalesReturns", url: "/reports/day-book-sales-returns", roles: Roles.finance },
      { title: "dayBookPurchaseReturns", url: "/reports/day-book-purchase-returns", roles: Roles.finance },
      { title: "dayBookGeneralJournal", url: "/reports/day-book-general-journal", roles: Roles.finance },
    ],
  },
  {
    label: "receivablesPayables",
    items: [
      { title: "outstandingCustomers", url: "/reports/outstanding-customers", roles: Roles.finance },
      { title: "outstandingSuppliers", url: "/reports/outstanding-suppliers", roles: Roles.finance },
    ],
  },
  {
    label: "cashAndLedger",
    items: [
      { title: "cashLedger", url: "/reports/cash-ledger", roles: Roles.finance },
      { title: "ledger", url: "/reports/ledger", roles: Roles.finance },
    ],
  },
  {
    label: "financialStatements",
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
    items: [{ title: "salaryAccount", url: "/reports/salary", roles: Roles.finance }],
  },
];

const hrSubmenu = [
  { title: "employees", url: "/hr/employees", roles: Roles.all },
  { title: "payroll", url: "/hr/payroll", roles: readPayrollRoles },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { t, isRTL } = useLanguage();
  const user = useAuthStore((state) => state.user);
  const isAdmin = can(user?.role, Roles.adminOnly);
  const clearSession = useAuthStore((state) => state.logout);
  const [reportsOpen, setReportsOpen] = useState(false);

  const visibleMainMenu = mainMenuItems.filter((item) => can(user?.role, item.roles));
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

  const isReportsRoute = visibleReportsGroups.some((group) =>
    group.items.some((item) => isActive(item.url))
  );

  useEffect(() => {
    if (isReportsRoute) {
      setReportsOpen(true);
    }
  }, [isReportsRoute]);

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

        <SidebarContent className="px-2 py-4">
          <SidebarGroup>
            <SidebarGroupLabel className={isRTL ? "font-urdu text-right" : ""}>{t("menu")}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {visibleMainMenu.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} data-testid={`nav-${item.title}`}>
                      <Link href={item.url} className={isRTL ? "flex-row-reverse" : ""}>
                        <item.icon className="h-4 w-4" />
                        <span className={isRTL ? "font-urdu" : ""}>{t(item.title as any)}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}

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

                {visibleReportsGroups.length > 0 && (
                  <Collapsible className="group/collapsible" open={isReportsRoute || reportsOpen} onOpenChange={setReportsOpen}>
                    <SidebarMenuItem>
                      <CollapsibleTrigger asChild>
                        <SidebarMenuButton className={isRTL ? "flex-row-reverse" : ""}>
                          <FileText className="h-4 w-4" />
                          <span className={isRTL ? "font-urdu" : ""}>{t("reports")}</span>
                          <ChevronDown className={`${isRTL ? "mr-auto" : "ml-auto"} h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180`} />
                        </SidebarMenuButton>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <SidebarMenuSub>
                          {visibleReportsGroups.map((group) => (
                            <div key={group.label} className="space-y-1">
                              <div className={`px-2 pt-2 text-xs font-semibold text-muted-foreground ${isRTL ? "text-right" : ""}`}>
                                {t(group.label as any)}
                              </div>
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
                            </div>
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
