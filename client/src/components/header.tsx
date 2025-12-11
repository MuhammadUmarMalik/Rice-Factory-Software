import { Sun, Moon, Globe, Search, Bell } from "lucide-react";
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

interface HeaderProps {
  title?: string;
}

export function Header({ title }: HeaderProps) {
  const { language, setLanguage, t, isRTL } = useLanguage();
  const { theme, toggleTheme } = useTheme();

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

        <Button 
          size="icon" 
          variant="ghost"
          data-testid="button-notifications"
        >
          <Bell className="h-4 w-4" />
        </Button>

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
