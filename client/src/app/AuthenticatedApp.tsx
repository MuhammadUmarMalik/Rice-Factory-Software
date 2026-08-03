import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { LanguageProvider, useLanguage } from "@/contexts/language-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { useAuthStore } from "@/stores/auth.store";
import { fetchWithAuth } from "@/lib/authFetch";
import { ensureMonoFonts } from "@/lib/fonts";
import { RouteSkeleton } from "@/components/loading/route-skeleton";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Roles, can, readAccountsRoles, readPayrollRoles, readProductsRoles } from "@/lib/roles";

const AppSidebar = lazy(() =>
  import("@/components/app-sidebar").then((mod) => ({ default: mod.AppSidebar })),
);
const Header = lazy(() =>
  import("@/components/header").then((mod) => ({ default: mod.Header })),
);
const ShortcutManager = lazy(() =>
  import("@/components/shortcut-manager").then((mod) => ({ default: mod.ShortcutManager })),
);

// Route-level code splitting keeps authenticated pages out of the login bundle.
function withRoles(
  Component: React.LazyExoticComponent<React.ComponentType>,
  roles: readonly string[],
): React.ComponentType {
  return function RoleGuarded() {
    const user = useAuthStore((state) => state.user);
    const [, setLocation] = useLocation();
    const allowed = can(user?.role, roles);
    useEffect(() => {
      if (!allowed) setLocation("/");
    }, [allowed, setLocation]);
    if (!allowed) return null;
    return <Component />;
  };
}

const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = withRoles(lazy(() => import("@/pages/dashboard")), Roles.all);
const Products = withRoles(lazy(() => import("@/pages/products")), readProductsRoles);
const Purchases = withRoles(lazy(() => import("@/pages/purchases")), Roles.purchasing);
const Processing = withRoles(lazy(() => import("@/pages/processing")), Roles.ops);
const Sales = withRoles(lazy(() => import("@/pages/sales")), Roles.sales);
const Settings = withRoles(lazy(() => import("@/pages/settings")), Roles.settings);
const UsersAdminPage = withRoles(lazy(() => import("@/pages/admin/users")), Roles.adminOnly);
const Customers = withRoles(lazy(() => import("@/pages/accounts/customers")), readAccountsRoles);
const Suppliers = withRoles(lazy(() => import("@/pages/accounts/suppliers")), readAccountsRoles);
const Banks = withRoles(lazy(() => import("@/pages/accounts/banks")), readAccountsRoles);
const StockReport = withRoles(lazy(() => import("@/pages/reports/stock")), Roles.purchasing);
const PurchaseReport = withRoles(lazy(() => import("@/pages/reports/purchases")), Roles.purchasing);
const SalesReport = withRoles(lazy(() => import("@/pages/reports/sales")), Roles.sales);
const BardanaReport = withRoles(lazy(() => import("@/pages/reports/bardana")), Roles.purchasing);
const LessReport = withRoles(lazy(() => import("@/pages/reports/less")), Roles.purchasing);
const Ledger = withRoles(lazy(() => import("@/pages/reports/ledger")), Roles.finance);
const TrialBalance = withRoles(lazy(() => import("@/pages/reports/trial-balance")), Roles.finance);
const ProfitLoss = withRoles(lazy(() => import("@/pages/reports/profit-loss")), Roles.finance);
const PrintPreviewPage = withRoles(lazy(() => import("@/pages/print-preview")), Roles.all);
const PeriodPurchases = withRoles(lazy(() => import("@/pages/reports/period-purchases")), Roles.finance);
const PeriodSales = withRoles(lazy(() => import("@/pages/reports/period-sales")), Roles.finance);
const GrossProfit = withRoles(lazy(() => import("@/pages/reports/gross-profit")), Roles.finance);
const OutstandingCustomers = withRoles(lazy(() => import("@/pages/reports/outstanding-customers")), Roles.finance);
const OutstandingSuppliers = withRoles(lazy(() => import("@/pages/reports/outstanding-suppliers")), Roles.finance);
const IncomeStatement = withRoles(lazy(() => import("@/pages/reports/income-statement")), Roles.finance);
const BalanceSheet = withRoles(lazy(() => import("@/pages/reports/balance-sheet")), Roles.finance);
const Capital = withRoles(lazy(() => import("@/pages/reports/capital")), Roles.finance);
const SalaryAccount = withRoles(lazy(() => import("@/pages/reports/salary")), Roles.finance);
const DayBook = withRoles(lazy(() => import("@/pages/reports/day-book")), Roles.finance);
const DayBookSales = withRoles(lazy(() => import("@/pages/reports/day-book-sales")), Roles.finance);
const DayBookPurchases = withRoles(lazy(() => import("@/pages/reports/day-book-purchases")), Roles.finance);
const DayBookCash = withRoles(lazy(() => import("@/pages/reports/day-book-cash")), Roles.finance);
const DayBookSalesReturns = withRoles(lazy(() => import("@/pages/reports/day-book-sales-returns")), Roles.finance);
const DayBookPurchaseReturns = withRoles(lazy(() => import("@/pages/reports/day-book-purchase-returns")), Roles.finance);
const DayBookGeneralJournal = withRoles(lazy(() => import("@/pages/reports/day-book-general-journal")), Roles.finance);
const Receipts = withRoles(lazy(() => import("@/pages/receipts")), Roles.finance);
const PaymentsPage = withRoles(lazy(() => import("@/pages/payments")), Roles.finance);
const Journal = withRoles(lazy(() => import("@/pages/journal")), Roles.finance);
const EmployeesPage = withRoles(lazy(() => import("@/pages/hr/employees")), Roles.all);
const PayrollPage = withRoles(lazy(() => import("@/pages/hr/payroll")), readPayrollRoles);
const ExpensesPage = withRoles(lazy(() => import("@/pages/expenses")), Roles.finance);
const CashDashboard = withRoles(lazy(() => import("@/pages/Cash/CashDashboard")), Roles.finance);
const CashLedger = withRoles(lazy(() => import("@/pages/Cash/CashLedger")), Roles.finance);

function Router() {
  const [location] = useLocation();
  return (
    // A page that throws while rendering used to blow past the single root
    // boundary and blank the whole shell. Keeping the boundary here preserves
    // the sidebar/header, and keying it on the path resets it on navigation.
    <ErrorBoundary key={location}>
    <Suspense fallback={<RouteSkeleton />}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/products" component={Products} />
        <Route path="/purchases" component={Purchases} />
        <Route path="/receipts" component={Receipts} />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/expenses" component={ExpensesPage} />
        <Route path="/cash" component={CashDashboard} />
        <Route path="/journal" component={Journal} />
        <Route path="/processing" component={Processing} />
        <Route path="/sales" component={Sales} />
        <Route path="/settings" component={Settings} />
        <Route path="/admin/users" component={UsersAdminPage} />
        <Route path="/accounts/customers" component={Customers} />
        <Route path="/accounts/suppliers" component={Suppliers} />
        <Route path="/accounts/banks" component={Banks} />
        <Route path="/reports/stock" component={StockReport} />
        <Route path="/reports/purchases" component={PurchaseReport} />
        <Route path="/reports/sales" component={SalesReport} />
        <Route path="/reports/bardana" component={BardanaReport} />
        <Route path="/reports/less" component={LessReport} />
        <Route path="/reports/period-purchases" component={PeriodPurchases} />
        <Route path="/reports/period-sales" component={PeriodSales} />
        <Route path="/reports/gross-profit" component={GrossProfit} />
        <Route path="/reports/day-book" component={DayBook} />
        <Route path="/reports/day-book-sales" component={DayBookSales} />
        <Route path="/reports/day-book/sales" component={DayBookSales} />
        <Route path="/reports/day-book-purchases" component={DayBookPurchases} />
        <Route path="/reports/day-book/purchases" component={DayBookPurchases} />
        <Route path="/reports/day-book-cash" component={DayBookCash} />
        <Route path="/reports/day-book/cash" component={DayBookCash} />
        <Route path="/reports/day-book-sales-returns" component={DayBookSalesReturns} />
        <Route path="/reports/day-book/sales-returns" component={DayBookSalesReturns} />
        <Route path="/reports/day-book-purchase-returns" component={DayBookPurchaseReturns} />
        <Route path="/reports/day-book/purchase-returns" component={DayBookPurchaseReturns} />
        <Route path="/reports/day-book-general-journal" component={DayBookGeneralJournal} />
        <Route path="/reports/day-book/general-journal" component={DayBookGeneralJournal} />
        <Route path="/reports/cash-ledger" component={CashLedger} />
        <Route path="/reports/outstanding-customers" component={OutstandingCustomers} />
        <Route path="/reports/outstanding-suppliers" component={OutstandingSuppliers} />
        <Route path="/reports/income-statement" component={IncomeStatement} />
        <Route path="/reports/balance-sheet" component={BalanceSheet} />
        <Route path="/reports/capital" component={Capital} />
        <Route path="/reports/salary" component={SalaryAccount} />
        <Route path="/hr/employees" component={EmployeesPage} />
        <Route path="/hr/payroll" component={PayrollPage} />
        <Route path="/reports/ledger" component={Ledger} />
        <Route path="/reports/ledger-sales" component={Ledger} />
        <Route path="/reports/ledger-purchases" component={Ledger} />
        <Route path="/reports/ledger-journal" component={Ledger} />
        <Route path="/reports/ledger-expenses" component={Ledger} />
        <Route path="/reports/ledger-payroll" component={Ledger} />
        <Route path="/reports/ledger-employee" component={Ledger} />
        <Route path="/reports/ledger-cash" component={Ledger} />
        <Route path="/reports/ledger-bank" component={Ledger} />
        <Route path="/reports/trial-balance" component={TrialBalance} />
        <Route path="/reports/profit-loss" component={ProfitLoss} />
        <Route path="/print-preview" component={PrintPreviewPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
    </ErrorBoundary>
  );
}

export default function AuthenticatedApp() {
  const [location, setLocation] = useLocation();
  const [authChecked, setAuthChecked] = useState(false);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    ensureMonoFonts();
  }, []);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetchWithAuth("/api/auth/me");
        if (!alive) return;
        if (res.ok) {
          const data = await res.json();
          setSession({ token, user: data.user || null });
        } else if (res.status === 401) {
          setSession({ token: null, user: null });
        }
      } catch {
        if (alive) setSession({ token: null, user: null });
      } finally {
        if (alive) setAuthChecked(true);
      }
    };
    load();
    return () => {
      alive = false;
    };
  }, [setSession, token]);

  useEffect(() => {
    if (!authChecked) return;
    if (!user && location !== "/login") setLocation("/login");
  }, [authChecked, user, location, setLocation]);

  const sidebarStyle = useMemo(
    () => ({
      "--sidebar-width": "16rem",
      "--sidebar-width-icon": "3rem",
    }),
    [],
  );

  const Shell = ({ children }: { children: React.ReactNode }) => {
    const { isRTL } = useLanguage();
    return <div className={`flex h-screen w-full ${isRTL ? "flex-row-reverse" : ""}`}>{children}</div>;
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <a
              href="#main-content"
              className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-background focus:px-3 focus:py-2 focus:text-sm focus:shadow-md"
            >
              Skip to content
            </a>
            <SidebarProvider style={sidebarStyle as React.CSSProperties}>
              <Shell>
                <Suspense
                  fallback={
                    <div
                      className="h-screen shrink-0 border-r border-border bg-sidebar"
                      style={{ width: "var(--sidebar-width)" }}
                    />
                  }
                >
                  <AppSidebar />
                </Suspense>
                <div className="flex flex-col flex-1 overflow-hidden">
                  <Suspense fallback={<div className="h-14 w-full border-b border-border bg-background" />}>
                    <Header />
                  </Suspense>
                  <main
                    id="main-content"
                    aria-label="Main content"
                    className="flex-1 overflow-auto bg-background"
                  >
                    {authChecked ? (
                      <Router />
                    ) : (
                      <RouteSkeleton />
                    )}
                  </main>
                </div>
              </Shell>
            </SidebarProvider>
            {user ? (
              <Suspense fallback={null}>
                <ShortcutManager />
              </Suspense>
            ) : null}
            <Toaster />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
