import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider } from "@/components/ui/sidebar";
import { LanguageProvider } from "@/contexts/language-context";
import { ThemeProvider } from "@/contexts/theme-context";
import { AppSidebar } from "@/components/app-sidebar";
import { Header } from "@/components/header";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Products from "@/pages/products";
import Purchases from "@/pages/purchases";
import Processing from "@/pages/processing";
import Sales from "@/pages/sales";
import Settings from "@/pages/settings";
import Customers from "@/pages/accounts/customers";
import Suppliers from "@/pages/accounts/suppliers";
import Banks from "@/pages/accounts/banks";
import Expenses from "@/pages/accounts/expenses";
import StockReport from "@/pages/reports/stock";
import PurchaseReport from "@/pages/reports/purchases";
import SalesReport from "@/pages/reports/sales";
import Ledger from "@/pages/reports/ledger";
import TrialBalance from "@/pages/reports/trial-balance";
import ProfitLoss from "@/pages/reports/profit-loss";
import Receipts from "@/pages/receipts";
import Payments from "@/pages/payments";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/products" component={Products} />
      <Route path="/purchases" component={Purchases} />
      <Route path="/receipts" component={Receipts} />
      <Route path="/payments" component={Payments} />
      <Route path="/processing" component={Processing} />
      <Route path="/sales" component={Sales} />
      <Route path="/settings" component={Settings} />
      <Route path="/accounts/customers" component={Customers} />
      <Route path="/accounts/suppliers" component={Suppliers} />
      <Route path="/accounts/banks" component={Banks} />
      <Route path="/accounts/expenses" component={Expenses} />
      <Route path="/reports/stock" component={StockReport} />
      <Route path="/reports/purchases" component={PurchaseReport} />
      <Route path="/reports/sales" component={SalesReport} />
      <Route path="/reports/ledger" component={Ledger} />
      <Route path="/reports/trial-balance" component={TrialBalance} />
      <Route path="/reports/profit-loss" component={ProfitLoss} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const sidebarStyle = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <LanguageProvider>
          <TooltipProvider>
            <SidebarProvider style={sidebarStyle as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1 overflow-hidden">
                  <Header />
                  <main className="flex-1 overflow-auto bg-background">
                    <Router />
                  </main>
                </div>
              </div>
            </SidebarProvider>
            <Toaster />
          </TooltipProvider>
        </LanguageProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
