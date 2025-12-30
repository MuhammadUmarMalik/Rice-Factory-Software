import { useEffect, useRef, useState } from "react";
import { Save, Globe, Palette, Shield, Building } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/language-context";
import { useTheme } from "@/contexts/theme-context";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/stores/auth.store";
import { useLocation } from "wouter";
import { defaultShortcutConfig, type ShortcutConfig } from "@/lib/shortcuts";
import { FormPageSkeleton } from "@/components/loading/page-skeletons";

type SettingsPayload = {
  businessName: string;
  businessNameUrdu: string;
  phone: string;
  address: string;
  logoUrl?: string;
  ntn?: string;
  strn?: string;
  language: "en" | "ur";
  theme: "light" | "dark";
  shortcuts?: ShortcutConfig;
};

const MAX_LOGO_SIZE = 512;

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image"));
    };
    img.src = url;
  });

const resizeLogo = async (file: File) => {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_LOGO_SIZE / Math.max(img.width, img.height));
  const width = Math.max(1, Math.round(img.width * scale));
  const height = Math.max(1, Math.round(img.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(img, 0, 0, width, height);
  const webp = canvas.toDataURL("image/webp", 0.9);
  if (webp.startsWith("data:image/webp")) return webp;
  return canvas.toDataURL(file.type || "image/png", 0.92);
};

const shortcutFields: Array<{ key: keyof ShortcutConfig; label: string; hint: string }> = [
  { key: "toggleSidebar", label: "Toggle sidebar", hint: "Ctrl+B" },
  { key: "printPreview", label: "Print preview", hint: "Ctrl+P" },
  { key: "downloadPdf", label: "Download PDF", hint: "Ctrl+Shift+P" },
  { key: "newDialog", label: "New dialog", hint: "Ctrl+N" },
  { key: "saveDialog", label: "Save dialog", hint: "Ctrl+Enter" },
  { key: "addLine", label: "Add line item", hint: "Ctrl+Shift+N" },
];

const defaultSettings: SettingsPayload = {
  businessName: "Rice Mill Enterprise",
  businessNameUrdu: "چاول مل ادارہ",
  phone: "+92 300 1234567",
  address: "Industrial Area, Lahore",
  logoUrl: "",
  ntn: "",
  strn: "",
  language: "en",
  theme: "light",
  shortcuts: defaultShortcutConfig,
};

export default function SettingsPage() {
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  const user = useAuthStore((state) => state.user);
  const [, setLocation] = useLocation();
  const isAdmin = user?.role === "admin";
  
  const [businessName, setBusinessName] = useState(defaultSettings.businessName);
  const [businessNameUrdu, setBusinessNameUrdu] = useState(defaultSettings.businessNameUrdu);
  const [phone, setPhone] = useState(defaultSettings.phone);
  const [address, setAddress] = useState(defaultSettings.address);
  const [logoUrl, setLogoUrl] = useState(defaultSettings.logoUrl || "");
  const [ntn, setNtn] = useState(defaultSettings.ntn || "");
  const [strn, setStrn] = useState(defaultSettings.strn || "");
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(defaultShortcutConfig);
  const logoInputRef = useRef<HTMLInputElement | null>(null);

  const { data: settingsData, isLoading } = useQuery<SettingsPayload>({
    queryKey: ["/api/settings"],
    staleTime: 60 * 60 * 1000,
  });

  useEffect(() => {
    if (settingsData) {
      setBusinessName(settingsData.businessName || "");
      setBusinessNameUrdu(settingsData.businessNameUrdu || "");
      setPhone(settingsData.phone || "");
      setAddress(settingsData.address || "");
      setLogoUrl(settingsData.logoUrl || "");
      setNtn(settingsData.ntn || "");
      setStrn(settingsData.strn || "");
      setTheme(settingsData.theme || "light");
      setShortcuts(settingsData.shortcuts || defaultShortcutConfig);
    }
  }, [settingsData, setTheme]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: SettingsPayload = {
        businessName,
        businessNameUrdu,
        phone,
        address,
        logoUrl,
        ntn,
        strn,
        language,
        theme,
        shortcuts,
      };
      await apiRequest("POST", "/api/settings", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/settings/shortcuts"] });
      return payload;
    },
    onSuccess: () => {
      toast({ title: t("savedSuccessfully") });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const handleSave = () => {
    saveMutation.mutate();
  };

  const handleLogoFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file", description: "Please select an image file.", variant: "destructive" });
      return;
    }
    resizeLogo(file)
      .then((result) => {
        if (result) setLogoUrl(result);
      })
      .catch(() => {
        toast({ title: "Logo error", description: "Unable to process logo image.", variant: "destructive" });
      });
  };

  const updateShortcut = (key: keyof ShortcutConfig, value: string) => {
    setShortcuts((prev) => ({ ...prev, [key]: value }));
  };

  if (isLoading && !settingsData) {
    return <FormPageSkeleton />;
  }

  return (
    <div className={`p-6 space-y-6 ${isRTL ? "font-urdu" : ""}`}>
      <div className={isRTL ? "text-right" : ""}>
        <h1 className="text-2xl font-semibold">{t("settings")}</h1>
        <p className="text-sm text-muted-foreground">
          {language === "ur" ? "ایپ کی ترتیب اور ترجیحات" : "Application settings and preferences"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Building className="h-4 w-4" />
              {language === "ur" ? "کاروباری معلومات" : "Business Information"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "دستاویزات کے لیے کاروباری تفصیل" : "Your business details for documents"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className={isRTL ? "font-urdu" : ""}>
                  {language === "ur" ? "کاروبار کا نام (انگریزی)" : "Business Name (English)"}
                </Label>
                <Input 
                  value={businessName} 
                  onChange={(e) => setBusinessName(e.target.value)}
                  data-testid="input-business-name"
                  disabled={isLoading || saveMutation.isPending}
                />
              </div>
              <div>
                <Label className="font-urdu">کاروبار کا نام (اردو)</Label>
                <Input 
                  value={businessNameUrdu} 
                  onChange={(e) => setBusinessNameUrdu(e.target.value)}
                  className="font-urdu text-right"
                  dir="rtl"
                  data-testid="input-business-name-urdu"
                  disabled={isLoading || saveMutation.isPending}
                />
              </div>
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "فون نمبر" : "Phone Number"}
              </Label>
              <Input 
                value={phone} 
                onChange={(e) => setPhone(e.target.value)}
                data-testid="input-phone"
                disabled={isLoading || saveMutation.isPending}
              />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "پتہ" : "Address"}
              </Label>
              <Input 
                value={address} 
                onChange={(e) => setAddress(e.target.value)}
                data-testid="input-address"
                disabled={isLoading || saveMutation.isPending}
              />
            </div>
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "Logo URL" : "Logo URL"}
              </Label>
              <div className="flex flex-col gap-3">
                <Input
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  data-testid="input-logo-url"
                  disabled={isLoading || saveMutation.isPending}
                />
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFile}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => logoInputRef.current?.click()}
                    disabled={isLoading || saveMutation.isPending}
                  >
                    {language === "ur" ? "لوگو اپلوڈ کریں" : "Upload Logo"}
                  </Button>
                  {logoUrl && (
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => setLogoUrl("")}
                      disabled={isLoading || saveMutation.isPending}
                    >
                      {language === "ur" ? "ہٹائیں" : "Clear"}
                    </Button>
                  )}
                </div>
                {logoUrl && (
                  <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <img
                      src={logoUrl}
                      alt="Company logo preview"
                      className="h-12 w-12 rounded border object-contain bg-white"
                      width={48}
                      height={48}
                    />
                    <span className="text-xs text-muted-foreground">
                      {language === "ur" ? "پیش نظارہ" : "Preview"}
                    </span>
                  </div>
                )}
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className={isRTL ? "font-urdu" : ""}>
                  {language === "ur" ? "NTN" : "NTN"}
                </Label>
                <Input 
                  value={ntn} 
                  onChange={(e) => setNtn(e.target.value)}
                  data-testid="input-ntn"
                  disabled={isLoading || saveMutation.isPending}
                />
              </div>
              <div>
                <Label className={isRTL ? "font-urdu" : ""}>
                  {language === "ur" ? "STRN" : "STRN"}
                </Label>
                <Input 
                  value={strn} 
                  onChange={(e) => setStrn(e.target.value)}
                  data-testid="input-strn"
                  disabled={isLoading || saveMutation.isPending}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Shield className="h-4 w-4" />
              {language === "ur" ? "O3UOUcU^OñU1UO" : "Shortcuts"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "OUOU_ UcUO OOU?OñUO OòOñUO" : "Customize keyboard shortcuts"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center justify-between rounded-lg border p-3 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className={isRTL ? "text-right" : ""}>
                <p className="font-medium">{language === "ur" ? "U?U1U,OU?OñUO" : "Enable shortcuts"}</p>
                <p className="text-sm text-muted-foreground">
                  {language === "ur" ? "OUOU_ UcUO U?U1U,OU?OñUO OçOñOUÚ" : "Turn all shortcuts on/off"}
                </p>
              </div>
              <Switch
                checked={shortcuts.enabled}
                onCheckedChange={(checked) => setShortcuts((prev) => ({ ...prev, enabled: checked }))}
                disabled={isLoading || saveMutation.isPending}
              />
            </div>
            <div className="space-y-3">
              {shortcutFields.map((field) => (
                <div key={field.key} className="grid gap-2 md:grid-cols-2 md:items-center">
                  <div className={isRTL ? "text-right" : ""}>
                    <Label className={isRTL ? "font-urdu" : ""}>{field.label}</Label>
                    <p className="text-xs text-muted-foreground">{field.hint}</p>
                  </div>
                  <Input
                    value={shortcuts[field.key] as string}
                    onChange={(event) => updateShortcut(field.key, event.target.value)}
                    placeholder={field.hint}
                    disabled={isLoading || saveMutation.isPending}
                  />
                </div>
              ))}
            </div>
            <div className={`flex ${isRTL ? "justify-start" : "justify-end"}`}>
              <Button
                type="button"
                variant="outline"
                onClick={() => setShortcuts(defaultShortcutConfig)}
                disabled={isLoading || saveMutation.isPending}
              >
                {language === "ur" ? "UóO?U1U,OU?OñUO O3U' O3U' " : "Reset defaults"}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Globe className="h-4 w-4" />
              {language === "ur" ? "زبان کی ترتیب" : "Language Settings"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "ایپ کی زبان تبدیل کریں" : "Change application language"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className={isRTL ? "text-right" : ""}>
                <p className="font-medium">{language === "ur" ? "موجودہ زبان" : "Current Language"}</p>
                <p className="text-sm text-muted-foreground">
                  {language === "ur" ? "انگریزی (بائیں سے دائیں)" : "English (Left to Right)"}
                </p>
              </div>
              <Badge variant="default">
                {language === "en" ? "English" : "اردو"}
              </Badge>
            </div>
            
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "زبان منتخب کریں" : "Select Language"}
              </Label>
              <Select
                value={language}
                onValueChange={(val: "en" | "ur") => setLanguage(val)}
              >
                <SelectTrigger data-testid="select-language" disabled={isLoading || saveMutation.isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ur">اردو (RTL)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Palette className="h-4 w-4" />
              {language === "ur" ? "ظاہری شکل" : "Appearance"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "ڈارک یا لائٹ موڈ" : "Dark or light mode"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className={isRTL ? "text-right" : ""}>
                <p className="font-medium">{language === "ur" ? "ڈارک موڈ" : "Dark Mode"}</p>
                <p className="text-sm text-muted-foreground">
                  {language === "ur" ? "آنکھوں کے لیے آرام دہ" : "Easier on the eyes"}
                </p>
              </div>
              <Switch 
                checked={theme === "dark"} 
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                data-testid="switch-theme"
                disabled={isLoading || saveMutation.isPending}
              />
            </div>
            
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "تھیم منتخب کریں" : "Select Theme"}
              </Label>
              <Select value={theme} onValueChange={(val: "light" | "dark") => setTheme(val)}>
                <SelectTrigger data-testid="select-theme" disabled={isLoading || saveMutation.isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{language === "ur" ? "لائٹ" : "Light"}</SelectItem>
                  <SelectItem value="dark">{language === "ur" ? "ڈارک" : "Dark"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Shield className="h-4 w-4" />
              {language === "ur" ? "سیکورٹی" : "Security"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "صارف اور رسائی کی ترتیبات" : "User and access settings"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`p-4 rounded-lg bg-muted/30 ${isRTL ? "text-right" : ""}`}>
              <p className="font-medium">{language === "ur" ? "موجودہ صارف" : "Current User"}</p>
              <p className="text-sm text-muted-foreground mt-1">{user?.username || "-"}</p>
              <Badge variant="secondary" className="mt-2">
                {user?.role ? user.role.toUpperCase() : language === "ur" ? "?????" : "Admin"}
              </Badge>
            </div>

            <Separator />

            <div className={`space-y-3 ${isRTL ? "text-right" : ""}`}>
              <p className="text-sm font-medium">{language === "ur" ? "رسائی درجات" : "Access Levels"}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">{language === "ur" ? "ایڈمن" : "Admin"}</Badge>
                <Badge variant="secondary">{language === "ur" ? "مینجر" : "Manager"}</Badge>
                <Badge variant="outline">{language === "ur" ? "اکاؤنٹنٹ" : "Accountant"}</Badge>
                <Badge variant="outline">{language === "ur" ? "آپریٹر" : "Operator"}</Badge>
              </div>
            </div>

            <Button
              variant="outline"
              className="w-full"
              disabled={!isAdmin}
              onClick={() => setLocation("/admin/users")}
            >
              {language === "ur" ? "?????? ?? ??????" : "Manage Users"}
              {!isAdmin && (
                <Badge variant="secondary" className="ml-2 text-xs">
                  {language === "ur" ? "??? ?????" : "Admin only"}
                </Badge>
              )}
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className={`flex ${isRTL ? "justify-start" : "justify-end"}`}>
        <Button onClick={handleSave} data-testid="button-save-settings" disabled={saveMutation.isPending || isLoading}>
          <Save className="h-4 w-4" />
          {saveMutation.isPending ? t("loading") : t("saveSettings")}
        </Button>
      </div>
    </div>
  );
}
