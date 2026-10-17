import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { useLocation } from "wouter";
import Wheat from "lucide-react/dist/esm/icons/wheat";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/apiRequest";
import { useLanguage } from "@/contexts/language-context";
import { useTheme } from "@/contexts/theme-context";
import type { TranslationKey } from "@/lib/i18n";

// Pakistani fiscal year: 1 July – 30 June, the one containing today.
function defaultFiscalYear() {
  const now = new Date();
  const startYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return {
    name: `FY ${startYear}-${String(startYear + 1).slice(-2)}`,
    startDate: `${startYear}-07-01`,
    endDate: `${startYear + 1}-06-30`,
  };
}

const steps: TranslationKey[] = ["setupStepAdmin", "setupStepMill", "setupStepBooks"];

function Field({ id, label, required, children }: { id: string; label: string; required?: boolean; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </label>
      {children}
    </div>
  );
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {options.map(([v, label]) => (
        <Button key={v} type="button" variant={value === v ? "default" : "outline"} aria-pressed={value === v} onClick={() => onChange(v)}>
          {label}
        </Button>
      ))}
    </div>
  );
}

export default function SetupPage() {
  const { t, isRTL, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [admin, setAdmin] = useState({ fullName: "", username: "", password: "", confirm: "" });
  const [mill, setMill] = useState({ businessName: "", businessNameUrdu: "", phone: "", address: "", ntn: "", strn: "" });
  const [fiscalYear, setFiscalYear] = useState(defaultFiscalYear);
  const [openingCash, setOpeningCash] = useState("");

  // Setup is one-time: once any user exists, this page is just the login page.
  useEffect(() => {
    fetch("/api/auth/setup-status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && !data.needsSetup) setLocation("/login");
      })
      .catch(() => {});
  }, [setLocation]);

  const fail = (key: TranslationKey) => {
    toast({ title: t("setupTitle"), description: t(key), variant: "destructive" });
    return false;
  };

  const validate = () => {
    if (step === 0) {
      if (!admin.fullName.trim() || !admin.username.trim()) return fail("fillRequiredFields");
      if (admin.password.length < 8) return fail("passwordMinLength");
      if (admin.password !== admin.confirm) return fail("passwordsDoNotMatch");
    }
    if (step === 1 && !mill.businessName.trim()) return fail("fillRequiredFields");
    if (step === 2 && (!fiscalYear.name.trim() || !fiscalYear.startDate || !fiscalYear.endDate || fiscalYear.endDate <= fiscalYear.startDate)) {
      return fail("fillRequiredFields");
    }
    return true;
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting || !validate()) return;
    if (step < steps.length - 1) {
      setStep(step + 1);
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await apiRequest("POST", "/api/auth/bootstrap", {
        fullName: admin.fullName.trim(),
        username: admin.username.trim(),
        password: admin.password,
        mill: { ...mill, language, theme },
        fiscalYear,
        openingCash: Number(openingCash) || 0,
      });
      const data = await res.json();
      if (data?.warnings?.length) {
        toast({ title: t("setupComplete"), description: `${t("setupPartial")} ${data.warnings.join(", ")}`, variant: "destructive" });
      } else {
        toast({ title: t("setupComplete"), description: t("setupCompleteDesc") });
      }
      setLocation("/login");
    } catch (err: any) {
      toast({ title: t("setupTitle"), description: err?.message || t("fillRequiredFields"), variant: "destructive" });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`min-h-screen flex flex-col items-center justify-center gap-6 bg-background bg-[radial-gradient(ellipse_at_top,hsl(var(--primary)/0.10),transparent_60%)] px-4 py-8 ${isRTL ? "font-urdu" : ""}`}
    >
      <div className="flex flex-col items-center gap-2 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md">
          <Wheat className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="text-lg font-semibold tracking-tight">{t("appTitle")}</p>
      </div>
      <Card className="w-full max-w-lg shadow-lg">
        <CardHeader>
          <CardTitle className={`text-2xl leading-tight ${isRTL ? "text-right" : ""}`}>{t("setupTitle")}</CardTitle>
          <p className="text-sm text-muted-foreground">{t("setupSubtitle")}</p>
          <ol className="flex gap-2 pt-3" aria-label={t("setupTitle")}>
            {steps.map((key, i) => (
              <li key={key} className="flex-1 space-y-1" aria-current={i === step ? "step" : undefined}>
                <div className={`h-1.5 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`} />
                <p className={`text-xs ${i === step ? "font-medium text-foreground" : "text-muted-foreground"}`}>
                  {i + 1}. {t(key)}
                </p>
              </li>
            ))}
          </ol>
        </CardHeader>
        <CardContent>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {step === 0 && (
              <>
                <Field id="setup-fullname" label={t("fullName")} required>
                  <Input id="setup-fullname" autoFocus value={admin.fullName} onChange={(e) => setAdmin({ ...admin, fullName: e.target.value })} autoComplete="name" />
                </Field>
                <Field id="setup-username" label={t("username")} required>
                  <Input id="setup-username" value={admin.username} onChange={(e) => setAdmin({ ...admin, username: e.target.value })} autoComplete="username" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="setup-password" label={t("password")} required>
                    <Input id="setup-password" type="password" value={admin.password} onChange={(e) => setAdmin({ ...admin, password: e.target.value })} autoComplete="new-password" />
                  </Field>
                  <Field id="setup-confirm" label={t("confirmPassword")} required>
                    <Input id="setup-confirm" type="password" value={admin.confirm} onChange={(e) => setAdmin({ ...admin, confirm: e.target.value })} autoComplete="new-password" />
                  </Field>
                </div>
                <p className="text-xs text-muted-foreground">{t("passwordMinLength")}</p>
              </>
            )}

            {step === 1 && (
              <>
                <Field id="setup-mill" label={t("millName")} required>
                  <Input id="setup-mill" autoFocus value={mill.businessName} onChange={(e) => setMill({ ...mill, businessName: e.target.value })} />
                </Field>
                <Field id="setup-mill-ur" label={t("millNameUrdu")}>
                  <Input id="setup-mill-ur" dir="rtl" className="font-urdu" value={mill.businessNameUrdu} onChange={(e) => setMill({ ...mill, businessNameUrdu: e.target.value })} />
                </Field>
                <Field id="setup-phone" label={t("phone")}>
                  <Input id="setup-phone" type="tel" value={mill.phone} onChange={(e) => setMill({ ...mill, phone: e.target.value })} />
                </Field>
                <Field id="setup-address" label={t("address")}>
                  <Input id="setup-address" value={mill.address} onChange={(e) => setMill({ ...mill, address: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="setup-ntn" label={t("ntn")}>
                    <Input id="setup-ntn" value={mill.ntn} onChange={(e) => setMill({ ...mill, ntn: e.target.value })} />
                  </Field>
                  <Field id="setup-strn" label={t("strn")}>
                    <Input id="setup-strn" value={mill.strn} onChange={(e) => setMill({ ...mill, strn: e.target.value })} />
                  </Field>
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="setup-language" label={t("language")}>
                    <Choice value={language} options={[["en", t("english")], ["ur", t("urdu")]]} onChange={setLanguage} />
                  </Field>
                  <Field id="setup-theme" label={t("theme")}>
                    <Choice value={theme} options={[["light", t("light")], ["dark", t("dark")]]} onChange={setTheme} />
                  </Field>
                </div>
                <Field id="setup-fy-name" label={t("fiscalYearName")} required>
                  <Input id="setup-fy-name" value={fiscalYear.name} onChange={(e) => setFiscalYear({ ...fiscalYear, name: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field id="setup-fy-start" label={t("fiscalYearStart")} required>
                    <Input id="setup-fy-start" type="date" value={fiscalYear.startDate} onChange={(e) => setFiscalYear({ ...fiscalYear, startDate: e.target.value })} />
                  </Field>
                  <Field id="setup-fy-end" label={t("fiscalYearEnd")} required>
                    <Input id="setup-fy-end" type="date" value={fiscalYear.endDate} onChange={(e) => setFiscalYear({ ...fiscalYear, endDate: e.target.value })} />
                  </Field>
                </div>
                <Field id="setup-cash" label={t("openingCash")}>
                  <Input id="setup-cash" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
                </Field>
              </>
            )}

            <div className="flex gap-2 pt-2">
              {step > 0 && (
                <Button type="button" variant="outline" className="flex-1" onClick={() => setStep(step - 1)} disabled={isSubmitting}>
                  {t("back")}
                </Button>
              )}
              <Button type="submit" className="flex-1" disabled={isSubmitting}>
                {step < steps.length - 1 ? t("next") : isSubmitting ? t("settingUp") : t("finishSetup")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
