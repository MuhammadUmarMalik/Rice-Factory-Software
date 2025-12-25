import { useEffect, useState } from "react";
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
};

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

  const { data: settingsData, isLoading } = useQuery<SettingsPayload>({
    queryKey: ["/api/settings"],
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
      };
      await apiRequest("POST", "/api/settings", payload);
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
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
              <Input 
                value={logoUrl} 
                onChange={(e) => setLogoUrl(e.target.value)}
                data-testid="input-logo-url"
                disabled={isLoading || saveMutation.isPending}
              />
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
