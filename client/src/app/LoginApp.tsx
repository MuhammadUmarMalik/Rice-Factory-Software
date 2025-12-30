import { Suspense, lazy, useLayoutEffect } from "react";
import { ThemeProvider } from "@/contexts/theme-context";
import { Toaster } from "@/components/ui/toaster";
import { LoginSkeleton } from "@/components/loading/page-skeletons";

const LoginPage = lazy(() => import("@/pages/login"));

function syncStoredLocale() {
  if (typeof document === "undefined") return;
  let language = "en";
  try {
    const stored = localStorage.getItem("language");
    if (stored === "ur" || stored === "en") language = stored;
  } catch {
    language = "en";
  }
  document.documentElement.dir = language === "ur" ? "rtl" : "ltr";
  document.documentElement.lang = language;
}

export default function LoginApp() {
  // Keep login lightweight: apply locale without loading the full i18n bundle.
  useLayoutEffect(() => {
    syncStoredLocale();
  }, []);

  return (
    <ThemeProvider>
      <Suspense fallback={<LoginSkeleton />}>
        <LoginPage />
      </Suspense>
      <Toaster />
    </ThemeProvider>
  );
}
