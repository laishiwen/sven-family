import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Sven Studio — Next-Gen AI Creation Studio",
  description:
    "Bring AI capabilities into your desktop workflow. Local-first, privacy-safe, intelligent creation for developers and creators.",
  keywords: [
    "AI studio",
    "desktop app",
    "AI tools",
    "developer tools",
    "local AI",
    "privacy",
  ],
  openGraph: {
    title: "Sven Studio — Next-Gen AI Creation Studio",
    description: "Bring AI capabilities into your desktop workflow.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="noise-bg">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
