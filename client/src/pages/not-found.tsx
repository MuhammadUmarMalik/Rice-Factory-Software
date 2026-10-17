import { Link } from "wouter";
import Compass from "lucide-react/dist/esm/icons/compass";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/language-context";

export default function NotFound() {
  const { t, isRTL } = useLanguage();
  return (
    <div className={`flex min-h-full w-full flex-col items-center justify-center gap-4 p-6 text-center ${isRTL ? "font-urdu" : ""}`}>
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-muted">
        <Compass className="h-7 w-7 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-muted-foreground">404</p>
        <h1 className="text-2xl font-semibold tracking-tight">{t("pageNotFound")}</h1>
        <p className="max-w-sm text-sm text-muted-foreground">{t("pageNotFoundHint")}</p>
      </div>
      <Button asChild>
        <Link href="/">{t("goHome")}</Link>
      </Button>
    </div>
  );
}
