import { useEffect, useRef, useState } from "react";
import { Save, Globe, Palette, Shield, Building, Database, Download, Upload, Info, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/language-context";
import { useTheme } from "@/contexts/theme-context";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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

type DataSummary = {
  tables: Array<{ name: string; count: number }>;
  totalRows: number;
  sizeBytes: number;
  updatedAt: string;
  dbUserVersion: number;
};

type BackupMeta = {
  formatVersion: number;
  exportedAt: string;
  appVersion?: string;
  dbUserVersion?: number;
};

type BackupPayload = {
  meta: BackupMeta;
  tables: Record<string, Array<Record<string, unknown>>>;
};

type AppVersion = {
  version: string;
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

const formatFileSize = (bytes: number) => {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
};

const readFileAsText = (file: File, onProgress?: (percent: number) => void) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
        onProgress(percent);
      }
    };
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsText(file);
  });

const safeJsonParse = (value: string) => {
  try {
    return { data: JSON.parse(value) as unknown, error: null as Error | null };
  } catch (error) {
    return { data: null, error: error as Error };
  }
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
  const canManageSettings = user?.role === "admin" || user?.role === "manager";
  
  const [businessName, setBusinessName] = useState(defaultSettings.businessName);
  const [businessNameUrdu, setBusinessNameUrdu] = useState(defaultSettings.businessNameUrdu);
  const [phone, setPhone] = useState(defaultSettings.phone);
  const [address, setAddress] = useState(defaultSettings.address);
  const [logoUrl, setLogoUrl] = useState(defaultSettings.logoUrl || "");
  const [ntn, setNtn] = useState(defaultSettings.ntn || "");
  const [strn, setStrn] = useState(defaultSettings.strn || "");
  const [shortcuts, setShortcuts] = useState<ShortcutConfig>(defaultShortcutConfig);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<number | null>(null);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<"replace" | "merge">("merge");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedBackup, setParsedBackup] = useState<BackupPayload | null>(null);
  const [backupErrors, setBackupErrors] = useState<string[]>([]);
  const [backupWarnings, setBackupWarnings] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [lastExportAt, setLastExportAt] = useState<string | null>(() =>
    typeof window === "undefined" ? null : window.localStorage.getItem("lastExportAt"),
  );

  const { data: settingsData, isLoading } = useQuery<SettingsPayload>({
    queryKey: ["/api/settings"],
    staleTime: 60 * 60 * 1000,
  });

  const { data: dataSummary } = useQuery<DataSummary>({
    queryKey: ["/api/data/summary"],
    enabled: canManageSettings,
    staleTime: 5 * 60 * 1000,
  });

  const { data: appVersion } = useQuery<AppVersion>({
    queryKey: ["/api/system/version"],
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

  const logClientError = (context: string, error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    if (typeof window !== "undefined" && window.electronLog?.write) {
      window.electronLog.write(`${context}: ${message}`);
    }
  };

  const tablePreview = dataSummary?.tables.slice(0, 6) ?? [];
  const remainingTables = Math.max(0, (dataSummary?.tables.length || 0) - tablePreview.length);
  const tableSummaryText =
    tablePreview.length > 0
      ? `${tablePreview.map((table) => `${table.name} (${table.count})`).join(", ")}${
          remainingTables > 0 ? ` and ${remainingTables} more` : ""
        }`
      : "No data available yet.";

  const validateBackupPayload = (payload: unknown) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    if (!payload || typeof payload !== "object") {
      errors.push("Backup file is not a valid JSON object.");
      return { errors, warnings, data: null as BackupPayload | null };
    }
    const data = payload as BackupPayload;
    if (!data.meta || typeof data.meta !== "object") {
      errors.push("Missing backup metadata.");
    } else {
      if (typeof data.meta.formatVersion !== "number") {
        errors.push("Backup format version is missing or invalid.");
      }
      if (!data.meta.exportedAt || Number.isNaN(Date.parse(data.meta.exportedAt))) {
        errors.push("Backup export date is missing or invalid.");
      }
      if (data.meta.formatVersion > 1) {
        warnings.push("Backup format is newer than this app. Import may fail.");
      }
      if (data.meta.appVersion && appVersion?.version && data.meta.appVersion !== "unknown") {
        const isNewer = data.meta.appVersion.localeCompare(appVersion.version, undefined, { numeric: true }) > 0;
        if (isNewer) {
          warnings.push("Backup was created with a newer app version. Review data before importing.");
        }
      }
      if (
        typeof data.meta.dbUserVersion === "number" &&
        typeof dataSummary?.dbUserVersion === "number" &&
        data.meta.dbUserVersion > dataSummary.dbUserVersion
      ) {
        warnings.push("Backup database version is newer than the current database.");
      }
    }
    if (!data.tables || typeof data.tables !== "object") {
      errors.push("Backup tables are missing.");
    } else {
      const tableEntries = Object.entries(data.tables);
      if (tableEntries.length === 0) {
        warnings.push("Backup contains no tables.");
      }
      tableEntries.forEach(([name, rows]) => {
        if (!Array.isArray(rows)) {
          errors.push(`Table ${name} is not a valid array.`);
        }
      });
    }
    return { errors, warnings, data: errors.length ? null : data };
  };

  const handleExport = async (format: "json" | "sql" = "json") => {
    setExporting(true);
    setExportProgress(0);
    try {
      const res = await apiRequest("GET", `/api/data/export?format=${format}`);
      let blob: Blob;
      const totalBytes = Number(res.headers.get("Content-Length") || 0);
      if (res.body) {
        const reader = res.body.getReader();
        const chunks: Uint8Array[] = [];
        let received = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            received += value.length;
            if (totalBytes) {
              setExportProgress(Math.min(100, Math.round((received / totalBytes) * 100)));
            }
          }
        }
        blob = new Blob(chunks, { type: format === "sql" ? "text/sql" : "application/json" });
      } else {
        blob = await res.blob();
      }

      const contentDisposition = res.headers.get("Content-Disposition") || "";
      const filenameMatch = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = filenameMatch?.[1] || `app_backup.${format}`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);

      const exportAt = new Date().toISOString();
      if (typeof window !== "undefined") {
        window.localStorage.setItem("lastExportAt", exportAt);
      }
      setLastExportAt(exportAt);

      toast({
        title: "Export complete",
        description: `Backup created (${formatFileSize(blob.size)}).`,
      });
    } catch (error) {
      logClientError("export failed", error);
      toast({
        title: "Export failed",
        description: "Please try again. If the issue persists, contact support.",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  };

  const handleFileSelection = async (file: File) => {
    setSelectedFile(file);
    setParsedBackup(null);
    setBackupErrors([]);
    setBackupWarnings([]);
    if (file.name.toLowerCase().endsWith(".sql")) {
      setBackupErrors(["SQL imports are not supported. Please use a JSON backup file."]);
      return;
    }

    try {
      setImportProgress(0);
      const raw = await readFileAsText(file, (percent) => setImportProgress(percent));
      const { data, error } = safeJsonParse(raw);
      if (error || !data) {
        setBackupErrors(["File is not valid JSON."]);
        return;
      }
      const validation = validateBackupPayload(data);
      setBackupErrors(validation.errors);
      setBackupWarnings(validation.warnings);
      setParsedBackup(validation.data);
    } catch (error) {
      logClientError("backup parse failed", error);
      setBackupErrors(["Unable to read the backup file."]);
    } finally {
      setImportProgress(null);
    }
  };

  const handleImport = async () => {
    if (!parsedBackup || importing) return;
    setImporting(true);
    try {
      const res = await apiRequest("POST", "/api/data/import", {
        mode: importMode,
        data: parsedBackup,
      });
      const result = await res.json();
      toast({
        title: "Import complete",
        description: `Imported ${result.totalRows ?? 0} rows using ${importMode} mode.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/data/summary"] });
      setSelectedFile(null);
      setParsedBackup(null);
      setBackupErrors([]);
      setBackupWarnings([]);
    } catch (error) {
      logClientError("import failed", error);
      toast({
        title: "Import failed",
        description:
          "No changes were applied. Verify the backup file or try Replace mode if the data is inconsistent.",
        variant: "destructive",
      });
    } finally {
      setImporting(false);
    }
  };

  const handleFileInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      handleFileSelection(file);
    }
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
              {language === "ur" ? "کاروباری معلومات" : "Business Details"}
            </CardTitle>
            <CardDescription>
              {language === "ur" ? "مل کی بنیادی تفصیلات" : "Basic information about your mill"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label className={isRTL ? "font-urdu" : ""}>
                  {language === "ur" ? "مل کا نام" : "Mill Name"}
                </Label>
                <Input
                  value={businessName}
                  onChange={(event) => setBusinessName(event.target.value)}
                  placeholder={language === "ur" ? "مل کا نام درج کریں" : "Enter mill name"}
                  disabled={isLoading || saveMutation.isPending}
                  data-testid="input-business-name"
                />
              </div>
              <div className="grid gap-2">
                <Label className={isRTL ? "font-urdu" : ""}>
                  {language === "ur" ? "مل کا نام (اردو)" : "Mill Name (Urdu)"}
                </Label>
                <Input
                  value={businessNameUrdu}
                  onChange={(event) => setBusinessNameUrdu(event.target.value)}
                  placeholder={language === "ur" ? "مل کا نام اردو میں" : "Mill name in Urdu"}
                  disabled={isLoading || saveMutation.isPending}
                  className={isRTL ? "font-urdu text-right" : ""}
                  dir={isRTL ? "rtl" : "ltr"}
                  data-testid="input-business-name-urdu"
                />
              </div>
              <div className="grid gap-2">
                <Label className={isRTL ? "font-urdu" : ""}>{t("phone")}</Label>
                <Input
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder={language === "ur" ? "فون نمبر" : "Phone number"}
                  disabled={isLoading || saveMutation.isPending}
                  data-testid="input-phone"
                />
              </div>
              <div className="grid gap-2">
                <Label className={isRTL ? "font-urdu" : ""}>{t("address")}</Label>
                <Textarea
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  placeholder={language === "ur" ? "مل کا پتہ" : "Mill address"}
                  rows={3}
                  disabled={isLoading || saveMutation.isPending}
                  data-testid="input-address"
                />
              </div>
            </div>

            <Separator />

            <div className="grid gap-3">
              <div className="grid gap-2">
                <Label className={isRTL ? "font-urdu" : ""}>
                  {language === "ur" ? "لوگو" : "Logo"}
                </Label>
                <div className={`flex items-center gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                  <Input
                    ref={logoInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoFile}
                    disabled={isLoading || saveMutation.isPending}
                    data-testid="input-logo"
                  />
                  {logoUrl ? (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setLogoUrl("")}
                      disabled={isLoading || saveMutation.isPending}
                    >
                      {language === "ur" ? "ہٹائیں" : "Clear"}
                    </Button>
                  ) : null}
                </div>
                {logoUrl ? (
                  <img
                    src={logoUrl}
                    alt={language === "ur" ? "لوگو" : "Logo preview"}
                    className="h-16 w-16 rounded border object-contain"
                  />
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label className={isRTL ? "font-urdu" : ""}>NTN</Label>
                <Input
                  value={ntn}
                  onChange={(event) => setNtn(event.target.value)}
                  placeholder={language === "ur" ? "NTN نمبر" : "NTN number"}
                  disabled={isLoading || saveMutation.isPending}
                  data-testid="input-ntn"
                />
              </div>
              <div className="grid gap-2">
                <Label className={isRTL ? "font-urdu" : ""}>STRN</Label>
                <Input
                  value={strn}
                  onChange={(event) => setStrn(event.target.value)}
                  placeholder={language === "ur" ? "STRN نمبر" : "STRN number"}
                  disabled={isLoading || saveMutation.isPending}
                  data-testid="input-strn"
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
              <Database className="h-4 w-4" />
              {language === "ur" ? "ڈیٹا مینجمنٹ" : "Data Management"}
            </CardTitle>
            <CardDescription>
              {language === "ur"
                ? "بیک اپ بنائیں یا ڈیٹا بحال کریں"
                : "Backup and restore your database safely"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4 space-y-3">
              <div className={`flex items-start justify-between gap-3 ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : ""}>
                  <p className="font-medium">{language === "ur" ? "ڈیٹا ایکسپورٹ" : "Export Database"}</p>
                  <p className="text-sm text-muted-foreground">
                    {language === "ur"
                      ? "تمام ٹیبلز کا بیک اپ ڈاؤن لوڈ کریں"
                      : "Download a complete backup of all tables."}
                  </p>
                  {lastExportAt ? (
                    <p className="text-xs text-muted-foreground mt-2">
                      {language === "ur"
                        ? `آخری ایکسپورٹ: ${new Date(lastExportAt).toLocaleString()}`
                        : `Last export: ${new Date(lastExportAt).toLocaleString()}`}
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canManageSettings || exporting}
                        onClick={() => handleExport("json")}
                      >
                        <Download className="h-4 w-4" />
                        {exporting ? "Exporting..." : "Export JSON"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Exports all data as JSON for backup and restore.</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={!canManageSettings || exporting}
                        onClick={() => handleExport("sql")}
                      >
                        <Download className="h-4 w-4" />
                        {exporting ? "Exporting..." : "Export SQL"}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Creates a SQL dump for advanced recovery.</TooltipContent>
                  </Tooltip>
                </div>
              </div>
              {exportProgress !== null ? <Progress value={exportProgress} /> : null}
            </div>

            <Separator />

            <div className="space-y-3">
              <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <div className={isRTL ? "text-right" : ""}>
                  <p className="font-medium">{language === "ur" ? "ڈیٹا امپورٹ" : "Import Database"}</p>
                  <p className="text-sm text-muted-foreground">
                    {language === "ur"
                      ? "بیک اپ فائل اپ لوڈ کریں"
                      : "Upload a backup file to restore data."}
                  </p>
                </div>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={importing || !canManageSettings}
                      onClick={() => importInputRef.current?.click()}
                    >
                      <Upload className="h-4 w-4" />
                      {language === "ur" ? "فائل منتخب کریں" : "Choose File"}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Upload a JSON backup to restore your data.</TooltipContent>
                </Tooltip>
              </div>

              <div
                onDrop={handleDrop}
                onDragOver={(event) => {
                  event.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                className={`rounded-lg border-2 border-dashed p-4 transition ${
                  dragActive ? "border-primary bg-muted/40" : "border-muted"
                }`}
              >
                <input
                  ref={importInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileInputChange}
                  className="hidden"
                  disabled={importing || !canManageSettings}
                />
                <div className={`flex flex-col gap-2 ${isRTL ? "items-end text-right" : "items-start"}`}>
                  <p className="text-sm">
                    {selectedFile
                      ? `${selectedFile.name} (${formatFileSize(selectedFile.size)})`
                      : language === "ur"
                      ? "فائل کو یہاں ڈراپ کریں یا براؤز کریں"
                      : "Drag and drop a backup file here, or click to browse."}
                  </p>
                  {importProgress !== null ? <Progress value={importProgress} /> : null}
                </div>
              </div>

              <div className="grid gap-2">
                <Label className={isRTL ? "font-urdu" : ""}>
                  {language === "ur" ? "امپورٹ آپشنز" : "Import Options"}
                </Label>
                <RadioGroup
                  value={importMode}
                  onValueChange={(value) => setImportMode(value as "replace" | "merge")}
                  className="grid gap-3"
                >
                  <div className={`flex items-start gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <RadioGroupItem value="merge" id="import-merge" />
                    <Label htmlFor="import-merge" className="text-sm">
                      {language === "ur" ? "موجودہ ڈیٹا کے ساتھ مرج کریں" : "Merge with existing data"}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-muted-foreground">
                          <Info className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Combine records and skip duplicates when possible.</TooltipContent>
                    </Tooltip>
                  </div>
                  <div className={`flex items-start gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
                    <RadioGroupItem value="replace" id="import-replace" />
                    <Label htmlFor="import-replace" className="text-sm">
                      {language === "ur" ? "موجودہ ڈیٹا کو تبدیل کریں" : "Replace existing data"}
                    </Label>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="cursor-help text-muted-foreground">
                          <AlertTriangle className="h-4 w-4" />
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>Overwrites current data with the backup file.</TooltipContent>
                    </Tooltip>
                  </div>
                </RadioGroup>
              </div>

              {backupErrors.length > 0 ? (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                  {backupErrors.join(" ")}
                </div>
              ) : null}
              {backupWarnings.length > 0 ? (
                <div className="rounded-md border border-amber-400/40 bg-amber-50 p-3 text-sm text-amber-700">
                  {backupWarnings.join(" ")}
                </div>
              ) : null}

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    disabled={!parsedBackup || importing || !isAdmin}
                    className="w-full"
                  >
                    <Upload className="h-4 w-4" />
                    {importing ? "Importing..." : "Import Database"}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Import</AlertDialogTitle>
                    <AlertDialogDescription>
                      Importing a backup will modify your current data. This action cannot be undone. A transaction
                      rollback will occur if the import fails.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleImport}>Confirm Import</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              {!isAdmin ? (
                <p className="text-xs text-muted-foreground">
                  {language === "ur" ? "صرف ایڈمن امپورٹ کر سکتا ہے" : "Only admins can import data."}
                </p>
              ) : null}
            </div>

            <Separator />

            <div className="rounded-lg bg-muted/30 p-4 space-y-2">
              <div className={`flex items-center justify-between ${isRTL ? "flex-row-reverse" : ""}`}>
                <p className="text-sm font-medium">{language === "ur" ? "کیا شامل ہے" : "What's Included"}</p>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="cursor-help text-muted-foreground">
                      <Info className="h-4 w-4" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>Tables and record counts included in the backup.</TooltipContent>
                </Tooltip>
              </div>
              <p className="text-xs text-muted-foreground">{tableSummaryText}</p>
              <p className="text-xs text-muted-foreground">
                {language === "ur"
                  ? `کل ریکارڈز: ${dataSummary?.totalRows ?? 0}، سائز: ${formatFileSize(
                      dataSummary?.sizeBytes ?? 0,
                    )}`
                  : `Total records: ${dataSummary?.totalRows ?? 0}, Size: ${formatFileSize(
                      dataSummary?.sizeBytes ?? 0,
                    )}`}
              </p>
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
