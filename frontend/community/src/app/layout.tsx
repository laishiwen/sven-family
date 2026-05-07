import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import { Providers } from "@/components/providers";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sven Community",
  description: "Share skills, tools, and agent configs",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieLocale = cookies().get("sven-locale")?.value;
  const initialLocale = cookieLocale === "en" ? "en" : "zh";

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Blocking script: read sven_theme from URL BEFORE first paint — no flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = 'dark';
                  var locale = 'zh';
                  // 1. Check URL param (embedded in Studio)
                  var p = new URLSearchParams(window.location.search);
                  var ut = p.get('sven_theme');
                  var ul = p.get('sven_locale');
                  if (ut === 'dark' || ut === 'light') {
                    theme = ut;
                  } else {
                    // 2. Check localStorage (standalone user preference)
                    var stored = localStorage.getItem('sven-theme');
                    if (stored === 'light' || stored === 'dark') {
                      theme = stored;
                    } else if (stored === 'system') {
                      theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                    }
                  }
                  if (ul) {
                    locale = ul;
                    localStorage.setItem('sven-locale', ul);
                    document.cookie = 'sven-locale=' + ul + '; path=/; max-age=31536000; SameSite=Lax';
                  }
                  document.documentElement.classList.add(theme);
                  document.documentElement.setAttribute('data-locale', locale);
                  // Listen for theme/locale changes from parent studio
                  window.addEventListener('message', function(e) {
                    if (e.data && e.data.type === 'sven:state') {
                      if (e.data.theme) {
                        var t = e.data.theme;
                        if (t === 'dark' || t === 'light') {
                          document.documentElement.classList.remove('light', 'dark');
                          document.documentElement.classList.add(t);
                        }
                      }
                      if (e.data.locale) {
                        localStorage.setItem('sven-locale', e.data.locale);
                        document.documentElement.setAttribute('data-locale', e.data.locale);
                      }
                    }
                  });
                } catch(e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap"
          rel="stylesheet"
        />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#D97706" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="Sven Community" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js');
                });
              }
            `,
          }}
        />
        <Providers initialLocale={initialLocale}>{children}</Providers>
      </body>
    </html>
  );
}
