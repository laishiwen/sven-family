"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTheme } from "next-themes";
import { useI18n } from "@/hooks/useI18n";
import { cn } from "@/lib/utils";
import {
  Sun,
  Moon,
  Monitor,
  Languages,
  Github,
  Star,
  Sparkles,
  Menu,
  X,
} from "lucide-react";

const themes = [
  { key: "light", icon: Sun, label: "Light" },
  { key: "dark", icon: Moon, label: "Dark" },
  { key: "system", icon: Monitor, label: "System" },
] as const;

function formatStars(count: number): string {
  if (count >= 1000) {
    return (count / 1000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return String(count);
}

export function Header() {
  const { locale, t, setLocale } = useI18n();
  const { theme, setTheme } = useTheme();
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [themeMenuOpen, setThemeMenuOpen] = useState(false);
  const [starCount, setStarCount] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const repo = process.env.NEXT_PUBLIC_GITHUB_REPO;
    if (!repo) return;
    fetch(`https://api.github.com/repos/${repo}`)
      .then((res) => res.json())
      .then((data) => {
        if (typeof data.stargazers_count === "number") {
          setStarCount(data.stargazers_count);
        }
      })
      .catch(() => {});
  }, []);

  if (!mounted) return null;

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: [0.25, 0.46, 0.45, 0.94] }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 w-full transition-all duration-500",
        scrolled ? "glass py-2.5" : "bg-transparent py-4",
      )}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <motion.a
          href="#"
          className="flex items-center gap-2.5"
          whileHover={{ scale: 1.02 }}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand shadow-lg shadow-amber-500/20 sm:h-9 sm:w-9 sm:rounded-xl">
            <Sparkles className="h-4 w-4 text-white sm:h-5 sm:w-5" />
          </div>
          <span className="text-base font-normal font-serif tracking-tight sm:text-lg">
            Sven Studio
          </span>
        </motion.a>

        {/* Right side */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* GitHub stars */}
          <a
            target="_blank"
            href={process.env.NEXT_PUBLIC_GITHUB_URL || "#"}
            className="hidden items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] px-3 py-1.5 text-sm font-medium transition-all hover:border-amber-400/30 hover:bg-amber-500/[0.04] sm:inline-flex"
          >
            <Github className="h-4 w-4" />
            <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
            {starCount != null && (
              <span className="tabular-nums" title={String(starCount)}>
                {formatStars(starCount)}
              </span>
            )}
          </a>

          {/* Theme switcher */}
          <div className="relative">
            <button
              onClick={() => setThemeMenuOpen(!themeMenuOpen)}
              className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] transition-all hover:border-amber-400/30 hover:bg-amber-500/[0.04]"
              aria-label="Toggle theme"
            >
              <motion.div
                key={theme}
                initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                transition={{ duration: 0.3 }}
              >
                {theme === "light" && <Sun className="h-4 w-4" />}
                {theme === "dark" && <Moon className="h-4 w-4" />}
                {theme === "system" && <Monitor className="h-4 w-4" />}
              </motion.div>
            </button>

            <AnimatePresence>
              {themeMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setThemeMenuOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.96 }}
                    transition={{ duration: 0.2 }}
                    className="absolute right-0 top-full z-50 mt-2 w-32 overflow-hidden rounded-xl border border-[var(--border-color)] bg-[var(--card-bg)] p-1 shadow-xl backdrop-blur-xl"
                  >
                    {themes.map(({ key, icon: Icon, label }) => (
                      <button
                        key={key}
                        onClick={() => {
                          setTheme(key);
                          setThemeMenuOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors hover:bg-amber-500/10",
                          theme === key && "text-primary",
                        )}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>

          {/* Language switcher */}
          <button
            onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
            className="flex h-9 items-center gap-1.5 rounded-full border border-[var(--border-color)] bg-[var(--card-bg)] px-3 text-sm font-medium transition-all hover:border-amber-400/30 hover:bg-amber-500/[0.04]"
          >
            <Languages className="h-4 w-4" />
            <span className="hidden sm:inline">
              {locale === "zh" ? "中文" : "EN"}
            </span>
          </button>
        </div>
      </div>
    </motion.header>
  );
}
