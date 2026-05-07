"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import i18n from "@/i18n";

type Theme = "light" | "dark" | "system";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  resolved: "light" | "dark";
  locale: string;
  setLocale: (locale: string) => void;
  isEmbedded: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "system",
  setTheme: () => {},
  resolved: "dark",
  locale: "zh",
  setLocale: () => {},
  isEmbedded: false,
});

export function useTheme() {
  return useContext(ThemeContext);
}

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function getIsEmbedded(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has("sven_embed")) return true;
    if (params.has("sven_theme") || params.has("sven_locale")) return true;
    return window.self !== window.top;
  } catch {}
  return false;
}

function getThemeFromUrl(): Theme | null {
  if (typeof window === "undefined") return null;
  try {
    const t = new URLSearchParams(window.location.search).get("sven_theme");
    if (t === "light" || t === "dark" || t === "system") return t;
  } catch {}
  return null;
}

function getStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem("sven-theme");
    if (stored === "light" || stored === "dark" || stored === "system")
      return stored;
  } catch {}
  return "system";
}

function getStoredLocale(): string {
  if (typeof window === "undefined") return "zh";
  try {
    const stored = localStorage.getItem("sven-locale");
    if (stored) return stored;
  } catch {}
  return "zh";
}

function getLocaleFromUrl(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const l = new URLSearchParams(window.location.search).get("sven_locale");
    if (l) return l;
  } catch {}
  return null;
}

function resolveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") return getSystemTheme();
  return theme;
}

function applyThemeClass(resolved: "light" | "dark") {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(resolved);
}

export function ThemeProvider({ children, initialLocale = "zh" }: { children: React.ReactNode; initialLocale?: string }) {
  const [isEmbedded] = useState(getIsEmbedded);
  const [theme, setThemeState] = useState<Theme>(() => {
    if (isEmbedded) return getThemeFromUrl() || "dark";
    return getStoredTheme();
  });
  const [resolved, setResolved] = useState<"light" | "dark">(() => {
    const initial = isEmbedded ? getThemeFromUrl() || "dark" : getStoredTheme();
    return resolveTheme(initial);
  });
  const [locale, setLocaleState] = useState(() => {
    if (isEmbedded) return getLocaleFromUrl() || initialLocale;
    return getStoredLocale() || initialLocale;
  });

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      if (!isEmbedded) {
        try {
          localStorage.setItem("sven-theme", t);
        } catch {}
      }
      const r = resolveTheme(t);
      setResolved(r);
      applyThemeClass(r);
    },
    [isEmbedded],
  );

  const setLocale = useCallback(
    (l: string) => {
      setLocaleState(l);
      if (!isEmbedded) {
        try {
          localStorage.setItem("sven-locale", l);
        } catch {}
      }
      i18n.changeLanguage(l);
    },
    [isEmbedded],
  );

  // Listen for system theme changes
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        const r = getSystemTheme();
        setResolved(r);
        applyThemeClass(r);
      }
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [theme]);

  // Listen for theme/locale from parent Studio app via postMessage
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "sven:state") {
        const { theme: t, locale: l } = event.data;
        if (t && (t === "light" || t === "dark" || t === "system")) {
          setTheme(t);
        }
        if (l && typeof l === "string") {
          setLocale(l);
        }
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [setTheme, setLocale]);

  // Sync i18n language and cookie on mount
  useEffect(() => {
    const resolvedLocale = isEmbedded ? getLocaleFromUrl() || initialLocale : getStoredLocale() || initialLocale;
    if (resolvedLocale !== i18n.language) {
      i18n.changeLanguage(resolvedLocale);
    }
    setLocaleState(resolvedLocale);
    try {
      document.cookie = 'sven-locale=' + resolvedLocale + '; path=/; max-age=31536000; SameSite=Lax';
    } catch {}
  }, []);

  // Apply theme on mount
  useEffect(() => {
    applyThemeClass(resolved);
  }, []);

  return (
    <ThemeContext.Provider
      value={{ theme, setTheme, resolved, locale, setLocale, isEmbedded }}
    >
      {children}
    </ThemeContext.Provider>
  );
}
