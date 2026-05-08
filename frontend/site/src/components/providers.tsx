"use client";

import { ThemeProvider } from "next-themes";
import { useEffect, useState, type ReactNode } from "react";
import { getInitialLocale, setLocale } from "@/lib/i18n";
import { initAnalytics } from "@/lib/analytics";
import { usePageTracking } from "@/hooks/usePageTracking";

function AnalyticsProvider({ children }: { children: ReactNode }) {
  usePageTracking();
  return <>{children}</>;
}

export function Providers({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setLocale(getInitialLocale());

    const statsApiUrl = process.env.NEXT_PUBLIC_STATS_API_URL;
    if (statsApiUrl) {
      initAnalytics({
        apiUrl: statsApiUrl,
        batchSize: 10,
        flushInterval: 5000,
        enableLogging: process.env.NODE_ENV === "development",
      });
    }

    setMounted(true);
  }, []);

  if (!mounted) {
    return <div style={{ visibility: "hidden" }}>{children}</div>;
  }

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      disableTransitionOnChange
    >
      <AnalyticsProvider>{children}</AnalyticsProvider>
    </ThemeProvider>
  );
}
