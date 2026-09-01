import { useEffect, useState, type FormEvent, type SVGProps } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useAuthStore } from "@/stores/auth.store";
import { apiRequest } from "@/lib/apiRequest";
import { useLanguage } from "@/contexts/language-context";
import { useLocation } from "wouter";

const EyeIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...props}
  >
    <path d="M9.88 9.88a3 3 0 0 0 4.24 4.24" />
    <path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c5.53 0 10 5 10 7a10.29 10.29 0 0 1-1.67 3.33" />
    <path d="M6.61 6.61A10.3 10.3 0 0 0 2 12c0 2 4.47 7 10 7a10.32 10.32 0 0 0 5.39-1.61" />
    <path d="m2 2 20 20" />
  </svg>
);

export default function LoginPage() {
  const { t, isRTL } = useLanguage();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const setSession = useAuthStore((state) => state.setSession);
  const user = useAuthStore((state) => state.user);

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (user) setLocation("/");
  }, [user, setLocation]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;
    const trimmedUsername = username.trim();
    if (!trimmedUsername || !password) {
      toast({ title: t("login"), description: t("useCredentials"), variant: "destructive" });
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/login", {
        username: trimmedUsername,
        password,
      });
      const data = await res.json();
      if (!data?.user) {
        throw new Error(t("signInToContinue"));
      }
      setSession({ token: data.token || null, user: data.user });
      setLocation("/");
    } catch (err: any) {
      toast({ title: t("login"), description: err?.message || t("signInToContinue"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className={`min-h-screen flex items-center justify-center bg-muted/30 px-4 ${isRTL ? "font-urdu" : ""}`}>
      <Card className="w-full max-w-md min-h-[330px] shadow-sm">
        <CardHeader className="min-h-[84px]">
          <CardTitle className={`text-2xl leading-tight ${isRTL ? "text-right" : ""}`}>{t("signIn")}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t("useCredentials")}
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">{t("username")}</label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
                data-testid="login-username"
              />
            </div>
            <div>
              <label className="text-sm font-medium">{t("password")}</label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  required
                  data-testid="login-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className={`absolute inset-y-0 ${isRTL ? "left-2" : "right-2"} inline-flex items-center justify-center text-muted-foreground hover:text-foreground`}
                  aria-label={showPassword ? t("hidePassword") : t("showPassword")}
                >
                  {showPassword ? <EyeOffIcon className="h-4 w-4" /> : <EyeIcon className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? t("signingIn") : t("signIn")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
