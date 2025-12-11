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
  Wheat
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

const mainMenuItems = [
  { title: "dashboard", url: "/", icon: LayoutDashboard },
  { title: "products", url: "/products", icon: Package },
  { title: "purchases", url: "/purchases", icon: ShoppingCart },
  { title: "processing", url: "/processing", icon: Factory },
  { title: "sales", url: "/sales", icon: TrendingUp },
];

const accountsSubmenu = [
  { title: "customers", url: "/accounts/customers" },
  { title: "suppliers", url: "/accounts/suppliers" },
  { title: "banks", url: "/accounts/banks" },
  { title: "expenses", url: "/accounts/expenses" },
];

const reportsSubmenu = [
  { title: "stockReport", url: "/reports/stock" },
  { title: "purchaseReport", url: "/reports/purchases" },
  { title: "salesReport", url: "/reports/sales" },
  { title: "ledger", url: "/reports/ledger" },
  { title: "trialBalance", url: "/reports/trial-balance" },
  { title: "profitLoss", url: "/reports/profit-loss" },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { t, language, isRTL } = useLanguage();

  const isActive = (url: string) => {
    if (url === "/") return location === "/";
    return location.startsWith(url);
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
                            <Link href={subItem.url} className={isRTL ? "flex-row-reverse font-urdu" : ""}>
                              {t(subItem.title as any)}
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
                      {reportsSubmenu.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton 
                            asChild 
                            isActive={isActive(subItem.url)}
                            data-testid={`nav-${subItem.title}`}
                          >
                            <Link href={subItem.url} className={isRTL ? "flex-row-reverse font-urdu" : ""}>
                              {t(subItem.title as any)}
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
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="p-4 border-t border-sidebar-border">
        <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm">AD</AvatarFallback>
          </Avatar>
          <div className={`flex-1 ${isRTL ? "text-right" : ""}`}>
            <p className={`text-sm font-medium ${isRTL ? "font-urdu" : ""}`}>Admin</p>
            <p className="text-xs text-muted-foreground">admin@ricemill.com</p>
          </div>
          <SidebarMenuButton size="sm" className="h-8 w-8" data-testid="button-logout">
            <LogOut className="h-4 w-4" />
          </SidebarMenuButton>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
