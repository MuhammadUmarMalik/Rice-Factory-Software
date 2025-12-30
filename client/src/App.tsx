import { Suspense, lazy } from "react";
import { Route, Switch, useLocation } from "wouter";
import { LoginSkeleton } from "@/components/loading/page-skeletons";
import { RouteSkeleton } from "@/components/loading/route-skeleton";

const LoginApp = lazy(() => import("@/app/LoginApp"));
const AuthenticatedApp = lazy(() => import("@/app/AuthenticatedApp"));

export default function App() {
  const [location] = useLocation();
  const fallback = location.startsWith("/login") ? <LoginSkeleton /> : <RouteSkeleton />;

  return (
    <Suspense fallback={fallback}>
      {/* Split login vs authenticated shells so /login only fetches minimal code. */}
      <Switch>
        <Route path="/login" component={LoginApp} />
        <Route component={AuthenticatedApp} />
      </Switch>
    </Suspense>
  );
}
