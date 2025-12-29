import { Suspense, lazy, useEffect, useMemo, useState } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { LanguageProvider } from "@/contexts/language-context";
import { ThemeProvider } from "@/contexts/theme-context";
const AppSidebar = lazy(() =>
  import("@/components/app-sidebar").then((mod) => ({ default: mod.AppSidebar })),
);
const Header = lazy(() =>
  import("@/components/header").then((mod) => ({ default: mod.Header })),
);
import { useLanguage } from "@/contexts/language-context";
import { useAuthStore } from "@/stores/auth.store";
import { fetchWithAuth } from "@/lib/authFetch";
const ShortcutManager = lazy(() =>
  import("@/components/shortcut-manager").then((mod) => ({ default: mod.ShortcutManager })),
);

const LoginPage = lazy(() => import("@/pages/login"));
const NotFound = lazy(() => import("@/pages/not-found"));
const Dashboard = lazy(() => import("@/pages/dashboard"));
const Products = lazy(() => import("@/pages/products"));
const Purchases = lazy(() => import("@/pages/purchases"));
const Processing = lazy(() => import("@/pages/processing"));
const Sales = lazy(() => import("@/pages/sales"));
const Settings = lazy(() => import("@/pages/settings"));
const UsersAdminPage = lazy(() => import("@/pages/admin/users"));
const Customers = lazy(() => import("@/pages/accounts/customers"));
const Suppliers = lazy(() => import("@/pages/accounts/suppliers"));
const Banks = lazy(() => import("@/pages/accounts/banks"));
const StockReport = lazy(() => import("@/pages/reports/stock"));
const PurchaseReport = lazy(() => import("@/pages/reports/purchases"));
const SalesReport = lazy(() => import("@/pages/reports/sales"));
const Ledger = lazy(() => import("@/pages/reports/ledger"));
const TrialBalance = lazy(() => import("@/pages/reports/trial-balance"));
const ProfitLoss = lazy(() => import("@/pages/reports/profit-loss"));
const PrintPreviewPage = lazy(() => import("@/pages/print-preview"));
const PeriodPurchases = lazy(() => import("@/pages/reports/period-purchases"));
const PeriodSales = lazy(() => import("@/pages/reports/period-sales"));
const GrossProfit = lazy(() => import("@/pages/reports/gross-profit"));
const DayBook = lazy(() => import("@/pages/reports/day-book"));
const OutstandingCustomers = lazy(() => import("@/pages/reports/outstanding-customers"));
const OutstandingSuppliers = lazy(() => import("@/pages/reports/outstanding-suppliers"));
const IncomeStatement = lazy(() => import("@/pages/reports/income-statement"));
const BalanceSheet = lazy(() => import("@/pages/reports/balance-sheet"));
const Capital = lazy(() => import("@/pages/reports/capital"));
const SalaryAccount = lazy(() => import("@/pages/reports/salary"));
const Receipts = lazy(() => import("@/pages/receipts"));
const PaymentsPage = lazy(() => import("@/pages/payments"));
const Journal = lazy(() => import("@/pages/journal"));
const EmployeesPage = lazy(() => import("@/pages/hr/employees"));
const PayrollPage = lazy(() => import("@/pages/hr/payroll"));
const ExpensesPage = lazy(() => import("@/pages/expenses"));

function Router() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/products" component={Products} />
        <Route path="/purchases" component={Purchases} />
        <Route path="/receipts" component={Receipts} />
        <Route path="/payments" component={PaymentsPage} />
        <Route path="/expenses" component={ExpensesPage} />
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
        <Route path="/reports/period-purchases" component={PeriodPurchases} />
        <Route path="/reports/period-sales" component={PeriodSales} />
        <Route path="/reports/gross-profit" component={GrossProfit} />
        <Route path="/reports/day-book" component={DayBook} />
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
  );
}

function App() {
  const [location, setLocation] = useLocation();
  const [authChecked, setAuthChecked] = useState(false);
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setSession = useAuthStore((state) => state.setSession);

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
    if (user && location === "/login") setLocation("/");
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
    return (
      <div className={`flex h-screen w-full ${isRTL ? "flex-row-reverse" : ""}`}>
        {children}
      </div>
    );
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
            {location === "/login" ? (
              <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading...</div>}>
                <LoginPage />
              </Suspense>
            ) : (
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
                    <Suspense
                      fallback={<div className="h-14 w-full border-b border-border bg-background" />}
                    >
                      <Header />
                    </Suspense>
                    <main id="main-content" className="flex-1 overflow-auto bg-background">
                      {authChecked ? <Router /> : <div className="p-6 text-sm text-muted-foreground">Loading...</div>}
                    </main>
                  </div>
                </Shell>
              </SidebarProvider>
            )}
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

export default App;
