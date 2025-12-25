import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Users,
  Package,
  ShoppingCart,
  Cog,
  FileText,
  Factory,
  TrendingUp,
  ChevronDown,
  LogOut,
  Wheat,
  Receipt,
  Wallet,
  UserRound,
  ReceiptText,
} from "lucide-react";
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

const mainMenuItems = [
  { title: "dashboard", url: "/", icon: LayoutDashboard },
  { title: "products", url: "/products", icon: Package },
  { title: "purchases", url: "/purchases", icon: ShoppingCart },
  { title: "cashReceipts", url: "/receipts", icon: Receipt },
  { title: "cashPayments", url: "/payments", icon: Receipt },
  { title: "expenses", url: "/expenses", icon: ReceiptText },
  // { title: "cashInHand", url: "/cash", icon: Wallet },
  { title: "journalVoucher", url: "/journal", icon: FileText },
  { title: "processing", url: "/processing", icon: Factory },
  { title: "sales", url: "/sales", icon: TrendingUp },
];

const accountsSubmenu = [
  { title: "customers", url: "/accounts/customers" },
  { title: "suppliers", url: "/accounts/suppliers" },
  { title: "banks", url: "/accounts/banks" },
  { title: "expenses", url: "/accounts/expenses" },
];

const reportsSubmenuGroups = [
  {
    label: "Operations",
    items: [
      { title: "stockReport", url: "/reports/stock" },
      { title: "purchaseReport", url: "/reports/purchases" },
      { title: "salesReport", url: "/reports/sales" },
      { title: "periodPurchases", url: "/reports/period-purchases" },
      { title: "periodSales", url: "/reports/period-sales" },
      { title: "grossProfit", url: "/reports/gross-profit" },
      { title: "dayBook", url: "/reports/day-book" },
    ],
  },
  {
    label: "Receivables/Payables",
    items: [
      { title: "outstandingCustomers", url: "/reports/outstanding-customers" },
      { title: "outstandingSuppliers", url: "/reports/outstanding-suppliers" },
    ],
  },
  {
    label: "Ledger",
    items: [
      { title: "ledger", url: "/reports/ledger" },
      // { title: "salesLedger", url: "/reports/ledger-sales" },
      // { title: "purchaseLedger", url: "/reports/ledger-purchases" },
      // { title: "journalLedger", url: "/reports/ledger-journal" },
      // { title: "expenseLedger", url: "/reports/ledger-expenses" },
      // { title: "payrollLedger", url: "/reports/ledger-payroll" },
      // { title: "employeePayLedger", url: "/reports/ledger-employee" },
      // { title: "cashLedger", url: "/reports/ledger-cash" },
      // { title: "bankLedger", url: "/reports/ledger-bank" },
    ],
  },
  {
    label: "Financial Statements",
    items: [
      { title: "trialBalance", url: "/reports/trial-balance" },
      { title: "profitLoss", url: "/reports/profit-loss" },
      { title: "incomeStatement", url: "/reports/income-statement" },
      { title: "balanceSheet", url: "/reports/balance-sheet" },
      { title: "capitalAccount", url: "/reports/capital" },
    ],
  },
  {
    label: "Payroll",
    items: [{ title: "salaryAccount", url: "/reports/salary" }],
  },
];

const hrSubmenu = [
  { title: "employees", url: "/hr/employees" },
  { title: "payroll", url: "/hr/payroll" },
];

export function AppSidebar() {
  const [location, setLocation] = useLocation();
  const { t, language, isRTL } = useLanguage();
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.role === "admin";
  const clearSession = useAuthStore((state) => state.logout);

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

  return (
    <Sidebar>
      <SidebarHeader className="p-4 border-b border-sidebar-border">
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <Wheat className="h-5 w-5" />
          </div>
          <div className={isRTL ? "text-right" : ""}>
            <h1 className={`text-base font-semibold ${isRTL ? "font-urdu" : ""}`}>
              {language === "ur" ? "چاول مل" : "Rice Mill"}
            </h1>
            <p className={`text-xs text-muted-foreground ${isRTL ? "font-urdu" : ""}`}>
              {language === "ur" ? "مینجمنٹ سسٹم" : "Management System"}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-4">
        <SidebarGroup>
          <SidebarGroupLabel className={isRTL ? "font-urdu text-right" : ""}>
            {language === "ur" ? "مینو" : "Menu"}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainMenuItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    asChild 
                    isActive={isActive(item.url)}
                    data-testid={`nav-${item.title}`}
                  >
                    <Link href={item.url} className={isRTL ? "flex-row-reverse" : ""}>
                      <item.icon className="h-4 w-4" />
                      <span className={isRTL ? "font-urdu" : ""}>{t(item.title as any)}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}

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
                      {accountsSubmenu.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton 
                            asChild 
                            isActive={isActive(subItem.url)}
                            data-testid={`nav-${subItem.title}`}
                          >
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

              <Collapsible className="group/collapsible">
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
                      {reportsSubmenuGroups.map((group) => (
                        <div key={group.label} className="space-y-1">
                          <div className={`px-2 pt-2 text-xs font-semibold text-muted-foreground ${isRTL ? "text-right" : ""}`}>
                            {group.label}
                          </div>
                          {group.items.map((subItem) => (
                            <SidebarMenuSubItem key={subItem.title}>
                              <SidebarMenuSubButton
                                asChild
                                isActive={isActive(subItem.url)}
                                data-testid={`nav-${subItem.title}`}
                              >
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
                      {hrSubmenu.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            asChild
                            isActive={isActive(subItem.url)}
                            data-testid={`nav-${subItem.title}`}
                          >
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

              <SidebarMenuItem>
                <SidebarMenuButton 
                  asChild 
                  isActive={isActive("/settings")}
                  data-testid="nav-settings"
                >
                  <Link href="/settings" className={isRTL ? "flex-row-reverse" : ""}>
                    <Cog className="h-4 w-4" />
                    <span className={isRTL ? "font-urdu" : ""}>{t("settings")}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={isActive("/admin/users")}
                    data-testid="nav-users"
                  >
                    <Link href="/admin/users" className={isRTL ? "flex-row-reverse" : ""}>
                      <Users className="h-4 w-4" />
                      <span className={isRTL ? "font-urdu" : ""}>Users</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">{initials}</AvatarFallback>
          </Avatar>
          <div className={`flex-1 ${isRTL ? "text-right" : ""}`}>
            <p className={`text-sm font-medium ${isRTL ? "font-urdu" : ""}`}>{user?.fullName || "User"}</p>
            <p className="text-xs text-muted-foreground">{user?.username || ""}</p>
          </div>
          <SidebarMenuButton
            size="sm"
            className="h-8 w-8"
            data-testid="button-logout"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4" />
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
