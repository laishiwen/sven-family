"use client";

import { ThemeProvider } from "./theme-provider";
import { AuthProvider } from "./auth-context";
import { InstallBanner } from "./InstallBanner";
import { AnalyticsTracker } from "./AnalyticsTracker";

export function Providers({ children, initialLocale }: { children: React.ReactNode; initialLocale: string }) {
  return (
    <ThemeProvider initialLocale={initialLocale}>
      <AuthProvider>
        <AnalyticsTracker />
        {children}
        <InstallBanner />
      </AuthProvider>
    </ThemeProvider>
  );
}
