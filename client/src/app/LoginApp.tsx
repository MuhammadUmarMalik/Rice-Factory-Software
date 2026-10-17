import { Suspense, lazy, useLayoutEffect } from "react";
import { useLocation } from "wouter";
import { ThemeProvider } from "@/contexts/theme-context";
import { LanguageProvider } from "@/contexts/language-context";
import { Toaster } from "@/components/ui/toaster";
import { LoginSkeleton } from "@/components/loading/page-skeletons";

const LoginPage = lazy(() => import("@/pages/login"));
const SetupPage = lazy(() => import("@/pages/setup"));

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
  const [location] = useLocation();
  // Keep login lightweight: apply locale without loading the full i18n bundle.
  useLayoutEffect(() => {
    syncStoredLocale();
  }, []);

  return (
    <ThemeProvider>
      <LanguageProvider>
        <Suspense fallback={<LoginSkeleton />}>
          {location.startsWith("/setup") ? <SetupPage /> : <LoginPage />}
        </Suspense>
      </LanguageProvider>
      <Toaster />
    </ThemeProvider>
  );
}
