import Sun from "lucide-react/dist/esm/icons/sun";
import Moon from "lucide-react/dist/esm/icons/moon";
import Globe from "lucide-react/dist/esm/icons/globe";
import Search from "lucide-react/dist/esm/icons/search";
import Bell from "lucide-react/dist/esm/icons/bell";
import Check from "lucide-react/dist/esm/icons/check";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { useLanguage } from "@/contexts/language-context";
import { useTheme } from "@/contexts/theme-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { invalidateApi, invalidationGroups, scopedInvalidation } from "@/api/invalidation";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { allNavItems } from "@/components/app-sidebar";
import { useAuthStore } from "@/stores/auth.store";
import { can } from "@/lib/roles";

type NotificationRow = {
  id: number;
  title: string;
  message?: string | null;
  type?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  isRead: boolean;
  createdAt: string | number | Date;
};

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { language, setLanguage, t, isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { data: notifications = [] } = useQuery<NotificationRow[]>({
    queryKey: ["/api/notifications"],
    refetchInterval: 15000,
  });
  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const [, setLocation] = useLocation();
  const role = useAuthStore((state) => state.user?.role);
  const pages = allNavItems
    .filter((item) => can(role, item.roles))
    .map((item) => ({ label: t(item.title as any), url: item.url }));
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Ctrl/Cmd+K focuses page search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const goTo = (value: string) => {
    const v = value.trim().toLowerCase();
    if (!v) return false;
    const hit = pages.find((p) => p.label.toLowerCase() === v) ?? pages.find((p) => p.label.toLowerCase().includes(v));
    if (!hit) return false;
    setLocation(hit.url);
    setQuery("");
    searchRef.current?.blur();
    return true;
  };

  const markReadMutation = useMutation({
    mutationKey: ["/api/notifications", "mark-read"],
    meta: scopedInvalidation,
    mutationFn: async (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: async () => {
      await invalidateApi(invalidationGroups.notifications);
    },
  });

  const markAllMutation = useMutation({
    mutationKey: ["/api/notifications", "mark-all-read"],
    meta: scopedInvalidation,
    mutationFn: async () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: async () => {
      await invalidateApi(invalidationGroups.notifications);
    },
  });

  return (
    <header
      className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-border bg-card/80 px-4 backdrop-blur supports-[backdrop-filter]:bg-card/70"
      aria-label="App header"
    >
      <div className={`flex items-center gap-4 ${isRTL ? "flex-row-reverse" : ""}`}>
        <SidebarTrigger data-testid="button-sidebar-toggle" />
        {title && (
          <h1 className={`text-lg font-semibold ${isRTL ? "font-urdu" : ""}`}>
            {title}
          </h1>
        )}
      </div>

      <div className={`flex items-center gap-2 ${isRTL ? "flex-row-reverse" : ""}`}>
        <div className="relative hidden md:block">
          <Search className={`pointer-events-none absolute ${isRTL ? "right-3" : "left-3"} top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground`} />
          <Input
            ref={searchRef}
            type="search"
            list="header-page-search"
            data-arrow-nav="false"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              // Picking a datalist option fires a change with the exact label.
              if (pages.some((p) => p.label === e.target.value)) goTo(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") goTo(query);
              if (e.key === "Escape") {
                setQuery("");
                e.currentTarget.blur();
              }
            }}
            placeholder={t("search")}
            className={`w-64 bg-muted/50 lg:w-72 ${isRTL ? "pr-9 pl-14 font-urdu text-right" : "pl-9 pr-14"}`}
            data-testid="input-search"
            aria-label={t("search")}
          />
          <kbd className={`pointer-events-none absolute ${isRTL ? "left-2" : "right-2"} top-1/2 -translate-y-1/2 rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground`}>
            Ctrl K
          </kbd>
          <datalist id="header-page-search">
            {pages.map((p) => (
              <option key={p.url} value={p.label} />
            ))}
          </datalist>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid="button-notifications"
              className="relative"
              aria-label={unreadCount ? `${t("notifications")} (${unreadCount})` : t("notifications")}
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 text-destructive-foreground ring-2 ring-card">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isRTL ? "start" : "end"} className="w-80">
            <div className="px-2 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              {t("notifications")}
            </div>
            {notifications.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">{t("noNotifications")}</div>
            )}
            {notifications.slice(0, 8).map((n) => (
              <DropdownMenuItem
                key={n.id}
                onClick={() => !n.isRead && markReadMutation.mutate(n.id)}
                className={n.isRead ? "opacity-70" : ""}
              >
                <div className="flex flex-col gap-1">
                  <div className="text-sm font-medium">{n.title}</div>
                  {n.message && <div className="text-xs text-muted-foreground">{n.message}</div>}
                  <div className="text-[10px] text-muted-foreground">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
            {notifications.length > 0 && (
              <DropdownMenuItem
                onClick={() => markAllMutation.mutate()}
                className="justify-center text-xs"
              >
                <Check className="h-3 w-3 mr-2" />
                {t("markAllRead")}
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid="button-language-toggle"
              aria-label={t("changeLanguage")}
            >
              <Globe className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isRTL ? "start" : "end"}>
            <DropdownMenuItem
              onClick={() => setLanguage("en")}
              className={language === "en" ? "bg-accent" : ""}
              data-testid="menu-item-english"
            >
              <span className="mr-2">EN</span>
              {t("english")}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => setLanguage("ur")}
              className={language === "ur" ? "bg-accent" : ""}
              data-testid="menu-item-urdu"
            >
              <span className="mr-2 font-urdu">اردو</span>
              {t("urdu")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button
          size="icon"
          variant="ghost"
          onClick={toggleTheme}
          data-testid="button-theme-toggle"
          aria-label={t("toggleTheme")}
        >
          {theme === "light" ? (
            <Moon className="h-4 w-4" />
          ) : (
            <Sun className="h-4 w-4" />
          )}
        </Button>
      </div>
    </header>
  );
}
