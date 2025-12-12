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

type SettingsPayload = {
  businessName: string;
  businessNameUrdu: string;
  phone: string;
  address: string;
  language: "en" | "ur";
  theme: "light" | "dark";
};

const defaultSettings: SettingsPayload = {
  businessName: "Rice Mill Enterprise",
  businessNameUrdu: "OñOOÝO3 U.U, OU+U1OñU_OñOOÝOý",
  phone: "+92 300 1234567",
  address: "Industrial Area, Lahore",
  language: "en",
  theme: "light",
};

export default function SettingsPage() {
  const { t, language, setLanguage, isRTL } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { toast } = useToast();
  
  const [businessName, setBusinessName] = useState(defaultSettings.businessName);
  const [businessNameUrdu, setBusinessNameUrdu] = useState(defaultSettings.businessNameUrdu);
  const [phone, setPhone] = useState(defaultSettings.phone);
  const [address, setAddress] = useState(defaultSettings.address);

  const { data: settingsData, isLoading } = useQuery<SettingsPayload>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (settingsData) {
      setBusinessName(settingsData.businessName || "");
      setBusinessNameUrdu(settingsData.businessNameUrdu || "");
      setPhone(settingsData.phone || "");
      setAddress(settingsData.address || "");
      setLanguage(settingsData.language || "en");
      setTheme(settingsData.theme || "light");
    }
  }, [settingsData, setLanguage, setTheme]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload: SettingsPayload = {
        businessName,
        businessNameUrdu,
        phone,
        address,
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
          {language === "ur" ? "OUOU_U,UOUcUOO'U+ UcUO O¦OñO¦UOO\"OO¦" : "Application settings and preferences"}
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Building className="h-4 w-4" />
              {language === "ur" ? "UcOOñU^O\"OOñ UcUO U.O1U,U^U.OO¦" : "Business Information"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "OU_U+U' UcOOñU^O\"OOñ UcUO O¦U?OæUOU,OO¦" : "Your business details for documents"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className={isRTL ? "font-urdu" : ""}>
                  {language === "ur" ? "UcOOñU^O\"OOñ UcO U+OU. (OU+U_OñUOOýUO)" : "Business Name (English)"}
                </Label>
                <Input 
                  value={businessName} 
                  onChange={(e) => setBusinessName(e.target.value)}
                  data-testid="input-business-name"
                  disabled={isLoading || saveMutation.isPending}
                />
              </div>
              <div>
                <Label className="font-urdu">UcOOñU^O\"OOñ UcO U+OU. (OOñO_U^)</Label>
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
                {language === "ur" ? "U?U^U+ U+U.O\"Oñ" : "Phone Number"}
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
                {language === "ur" ? "U_O¦U?" : "Address"}
              </Label>
              <Input 
                value={address} 
                onChange={(e) => setAddress(e.target.value)}
                data-testid="input-address"
                disabled={isLoading || saveMutation.isPending}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Globe className="h-4 w-4" />
              {language === "ur" ? "OýO\"OU+ UcUO O¦OñO¦UOO\"OO¦" : "Language Settings"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "OUOU_U,UOUcUOO'U+ UcUO OýO\"OU+ O¦O\"O_UOU, UcOñUOU§" : "Change application language"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className={isRTL ? "text-right" : ""}>
                <p className="font-medium">{language === "ur" ? "U.U^OªU^O_U? OýO\"OU+" : "Current Language"}</p>
                <p className="text-sm text-muted-foreground">
                  {language === "ur" ? "OOñO_U^ (O_OOÝUOU§ O3U' O\"OOÝUOU§)" : "English (Left to Right)"}
                </p>
              </div>
              <Badge variant="default">
                {language === "en" ? "English" : "OOñO_U^"}
              </Badge>
            </div>
            
            <div>
              <Label className={isRTL ? "font-urdu" : ""}>
                {language === "ur" ? "OýO\"OU+ U.U+O¦OrO\" UcOñUOU§" : "Select Language"}
              </Label>
              <Select value={language} onValueChange={(val: "en" | "ur") => setLanguage(val)}>
                <SelectTrigger data-testid="select-language" disabled={isLoading || saveMutation.isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ur">OOñO_U^ (Urdu)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Palette className="h-4 w-4" />
              {language === "ur" ? "O,OU?OñUO O'UcU," : "Appearance"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "U^OOñUc UOO U,OOÝU1 U.U^U^" : "Dark or light mode"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`flex items-center justify-between p-4 rounded-lg bg-muted/30 ${isRTL ? "flex-row-reverse" : ""}`}>
              <div className={isRTL ? "text-right" : ""}>
                <p className="font-medium">{language === "ur" ? "U^OOñUc U.U^U^" : "Dark Mode"}</p>
                <p className="text-sm text-muted-foreground">
                  {language === "ur" ? "O›U+UcU_U^U§ UcU' U,UOU' O›OñOU. O_U?" : "Easier on the eyes"}
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
                {language === "ur" ? "O¦U_UOU. U.U+O¦OrO\" UcOñUOU§" : "Select Theme"}
              </Label>
              <Select value={theme} onValueChange={(val: "light" | "dark") => setTheme(val)}>
                <SelectTrigger data-testid="select-theme" disabled={isLoading || saveMutation.isPending}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="light">{language === "ur" ? "U,OOÝU1" : "Light"}</SelectItem>
                  <SelectItem value="dark">{language === "ur" ? "U^OOñUc" : "Dark"}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className={isRTL ? "text-right" : ""}>
            <CardTitle className={`flex items-center gap-2 text-base ${isRTL ? "flex-row-reverse" : ""}`}>
              <Shield className="h-4 w-4" />
              {language === "ur" ? "O3UOUcUOU^OñU1UO" : "Security"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "OæOOñU? OU^Oñ OñO3OOÝUO UcUO O¦OñO¦UOO\"OO¦" : "User and access settings"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className={`p-4 rounded-lg bg-muted/30 ${isRTL ? "text-right" : ""}`}>
              <p className="font-medium">{language === "ur" ? "U.U^OªU^O_U? OæOOñU?" : "Current User"}</p>
              <p className="text-sm text-muted-foreground mt-1">admin@ricemillerp.com</p>
              <Badge variant="secondary" className="mt-2">
                {language === "ur" ? "OUOU^U.U+" : "Admin"}
              </Badge>
            </div>

            <Separator />

            <div className={`space-y-3 ${isRTL ? "text-right" : ""}`}>
              <p className="text-sm font-medium">{language === "ur" ? "OñO3OOÝUO UcUO O3OúO-UOU§" : "Access Levels"}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="default">{language === "ur" ? "OUOU^U.U+" : "Admin"}</Badge>
                <Badge variant="secondary">{language === "ur" ? "U.UOU+UOOªOñ" : "Manager"}</Badge>
                <Badge variant="outline">{language === "ur" ? "OUcOOU+U1U+U1" : "Accountant"}</Badge>
                <Badge variant="outline">{language === "ur" ? "O›U_OñUOU1Oñ" : "Operator"}</Badge>
              </div>
            </div>

            <Button variant="outline" className="w-full" disabled>
              {language === "ur" ? "OæOOñU?UOU+ UcO OU+O¦O,OU." : "Manage Users"}
              <Badge variant="secondary" className="ml-2 text-xs">
                {language === "ur" ? "OªU,O_ O› OñU?O U?U'" : "Coming Soon"}
              </Badge>
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
