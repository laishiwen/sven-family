import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import { Sun, Moon, Monitor, Globe } from "lucide-react";
import { useLocation } from "react-router-dom";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ROUTE_TITLES: Record<string, string> = {
  "/dashboard": "dashboard",
  "/community": "community",
  "/chat": "chat",
  "/agents": "agents",
  "/llm": "llm",
  "/prompts": "prompts",
  "/tools": "tools",
  "/skills": "skills",
  "/mcp": "mcp",
  "/rag": "rag",
  "/store": "store",
  "/scheduler": "scheduler",
  "/channels": "channels",
  "/observability": "observability",
  "/settings": "settings",
};

export default function TopBar() {
  const { t, i18n } = useTranslation();
  const { theme, setTheme, locale, setLocale } = useAppStore();
  const { pathname } = useLocation();

  const setLanguage = (next: "zh-CN" | "en") => {
    setLocale(next);
    i18n.changeLanguage(next);
  };

  const ThemeIcon =
    theme === "dark" ? Moon : theme === "system" ? Monitor : Sun;

  const routeKey = Object.keys(ROUTE_TITLES).find(
    (r) => pathname === r || pathname.startsWith(r + "/"),
  );
  const pageTitle = routeKey ? t(ROUTE_TITLES[routeKey]) : "";

  return (
    <header className="flex items-center justify-between h-[calc(2.75rem+var(--titlebar-offset))] pt-[var(--titlebar-offset)] px-5 flex-shrink-0 sticky top-0 z-10 bg-background/80 backdrop-blur-xl [-webkit-app-region:drag]">
      <span className="text-sm font-normal text-foreground/70 tracking-tight font-serif [-webkit-app-region:no-drag]">
        {pageTitle}
      </span>

      <div className="flex items-center gap-1 [&>*]:[-webkit-app-region:no-drag]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
              title={t("theme")}
            >
              <ThemeIcon className="w-3.5 h-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setTheme("light")}>
              {t("light-mode")}
              {theme === "light" ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("dark")}>
              {t("dark-mode")}
              {theme === "dark" ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setTheme("system")}>
              {t("system-mode")}
              {theme === "system" ? " ✓" : ""}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1 px-1.5 h-7 rounded-md text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors text-xs font-medium"
              title={t("topbar.choose-language")}
            >
              <Globe className="w-3 h-3" />
              {locale === "zh-CN"
                ? t("locale.short.zh-CN")
                : t("locale.short.en")}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-36">
            <DropdownMenuItem onClick={() => setLanguage("zh-CN")}>
              {t("locale.zh-CN")}
              {locale === "zh-CN" ? " ✓" : ""}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setLanguage("en")}>
              {t("locale.en")}
              {locale === "en" ? " ✓" : ""}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
