import { Sun, Moon, Globe, Search, Bell, Check } from "lucide-react";
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
import { apiRequest, queryClient } from "@/lib/queryClient";

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

  const markReadMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("PATCH", `/api/notifications/${id}/read`),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: async () => apiRequest("POST", "/api/notifications/read-all"),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/notifications"] });
    },
  });

  return (
    <header className="flex h-14 items-center justify-between gap-4 border-b border-border bg-background px-4">
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
          <Search className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground`} />
          <Input
            type="search"
            placeholder={t("search")}
            className={`w-64 ${isRTL ? "pr-9 pl-4 font-urdu text-right" : "pl-9 pr-4"}`}
            data-testid="input-search"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              data-testid="button-notifications"
              className="relative"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 rounded-full bg-destructive text-white text-[10px] px-1.5">
                  {unreadCount}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={isRTL ? "start" : "end"} className="w-80">
            <div className="px-2 py-2 text-xs uppercase tracking-wide text-muted-foreground">
              Notifications
            </div>
            {notifications.length === 0 && (
              <div className="px-2 py-3 text-sm text-muted-foreground">No notifications yet.</div>
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
                Mark all read
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
              English
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setLanguage("ur")}
              className={language === "ur" ? "bg-accent" : ""}
              data-testid="menu-item-urdu"
            >
              <span className="mr-2 font-urdu">اردو</span>
              Urdu
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Button 
          size="icon" 
          variant="ghost" 
          onClick={toggleTheme}
          data-testid="button-theme-toggle"
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
