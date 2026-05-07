"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth-context";
import { AuthModal } from "./auth-modal";
import { useTheme } from "./theme-provider";
import { LogOut, Sun, Moon, Monitor, User, Mail } from "lucide-react";

const themeCycle: Record<string, { next: string; icon: typeof Sun }> = {
  light: { next: "dark", icon: Sun },
  dark: { next: "system", icon: Moon },
  system: { next: "light", icon: Monitor },
};

export function Header() {
  const { t } = useTranslation();
  const { user, logout } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { theme, setTheme, locale, setLocale, isEmbedded } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Hover handlers for dropdown
  const showMenu = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    setMenuOpen(true);
  };
  const hideMenu = () => {
    hoverTimeoutRef.current = setTimeout(() => setMenuOpen(false), 150);
  };

  const handleThemeToggle = () => {
    const next = themeCycle[theme]?.next || "light";
    setTheme(next as "light" | "dark" | "system");
  };

  const ThemeIcon = themeCycle[theme]?.icon || Monitor;

  // Only hide toggles when BOTH mounted AND embedded (avoids SSR hydration mismatch)
  const hideToggles = mounted && isEmbedded;

  return (
    <>
      <header className="sticky top-0 z-50 bg-background/80 backdrop-blur-xl border-b border-border/60">
        <div className="max-w-4xl mx-auto flex items-center justify-between h-12 px-5">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span className="font-normal text-base tracking-tight font-serif">
              {t("header.title")}
            </span>
          </Link>

          <div className="flex items-center gap-1.5">
            {/* Theme toggle + Locale toggle: hidden when embedded in Studio */}
            {!hideToggles && (
              <>
                <button
                  onClick={handleThemeToggle}
                  className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                  title={theme === "light" ? t("header.themeLight") : theme === "dark" ? t("header.themeDark") : t("header.themeSystem")}
                  suppressHydrationWarning
                >
                  {mounted ? <ThemeIcon className="h-4 w-4" /> : <Monitor className="h-4 w-4" />}
                </button>

                <button
                  onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
                  className="h-8 px-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-colors"
                >
                  {mounted ? (locale === "zh" ? t("header.localeZh") : t("header.localeEn")) : "中"}
                </button>
              </>
            )}

            {user ? (
                /* User avatar + hover dropdown */
                <div
                  className="relative"
                  ref={menuRef}
                  onMouseEnter={showMenu}
                  onMouseLeave={hideMenu}
                >
                  <button className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-primary/60 text-primary text-xs font-semibold hover:border-primary hover:bg-primary/5 transition-colors overflow-hidden">
                    {user.avatar_url ? (
                      <img
                        src={user.avatar_url}
                        alt={user.username}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      (user.username || user.email || "?").charAt(0).toUpperCase()
                    )}
                  </button>

                  {menuOpen && (
                    <div className="absolute right-0 top-full mt-2 w-56 bg-card border border-border rounded-xl shadow-elevated z-50 overflow-hidden">
                      {/* User info */}
                      <div className="px-4 py-3 border-b border-border">
                        <div className="flex items-center gap-2 mb-1">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium text-foreground">{user.username}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                        </div>
                      </div>

                      {/* Logout */}
                      <button
                        onClick={() => { logout(); setMenuOpen(false); }}
                        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-muted-foreground hover:bg-muted hover:text-red-500 transition-colors"
                      >
                        <LogOut className="h-3.5 w-3.5" />
                        {mounted ? t("header.signOut") : "退出登录"}
                      </button>
                    </div>
                  )}
                </div>
            ) : (
              <button
                onClick={() => setAuthOpen(true)}
                className="h-8 px-4 rounded-lg text-[13px] font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors ml-1"
              >
                {mounted ? t("header.signIn") : "登录"}
              </button>
            )}
          </div>
        </div>
      </header>

      <AuthModal open={authOpen} onClose={() => setAuthOpen(false)} />
    </>
  );
}
