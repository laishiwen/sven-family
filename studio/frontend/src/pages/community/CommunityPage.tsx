import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "@/stores/appStore";

const COMMUNITY_URL =
  import.meta.env.VITE_COMMUNITY_URL;

export default function CommunityPage() {
  const { theme, locale } = useAppStore();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const loadedRef = useRef(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSlow, setIsSlow] = useState(false);

  // Resolve "system" to actual light/dark for the iframe URL param
  const resolvedTheme = useMemo(() => {
    if (theme === "system") {
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return theme;
  }, [theme]);

  const src = `${COMMUNITY_URL}?sven_theme=${resolvedTheme}&sven_locale=${locale}`;

  useEffect(() => {
    loadedRef.current = false;
    setIsLoading(true);
    setIsSlow(false);

    const timer = window.setTimeout(() => {
      setIsSlow(true);
    }, 6000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [src]);

  // Live sync via postMessage (no iframe reload for subsequent theme changes)
  useEffect(() => {
    if (!loadedRef.current) return;
    iframeRef.current?.contentWindow?.postMessage(
      { type: "sven:state", theme: resolvedTheme, locale },
      "*",
    );
  }, [resolvedTheme, locale]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const onLoad = () => {
      loadedRef.current = true;
      setIsLoading(false);
      setIsSlow(false);
      iframe.contentWindow?.postMessage(
        { type: "sven:state", theme: resolvedTheme, locale },
        "*",
      );
    };

    const onError = () => {
      setIsSlow(true);
    };

    iframe.addEventListener("load", onLoad);
    iframe.addEventListener("error", onError);
    return () => {
      iframe.removeEventListener("load", onLoad);
      iframe.removeEventListener("error", onError);
    };
  }, [resolvedTheme, locale]);

  return (
    <div className="relative h-full w-full">
      <iframe
        ref={iframeRef}
        src={src}
        className={`h-full w-full border-0 transition-opacity duration-200 ${
          isLoading ? "opacity-0" : "opacity-100"
        }`}
        title="Sven Studio Community"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-modals"
      />

      {isLoading && (
        <div className="absolute inset-0 z-10 bg-background px-6 py-5">
          <div className="space-y-3 max-w-4xl mx-auto">
            <div className="h-8 w-44 rounded-lg bg-muted animate-pulse" />
            <div className="h-4 w-80 rounded bg-muted animate-pulse" />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
              {Array.from({ length: 6 }).map((_, i) => (
                <div
                  key={i}
                  className="rounded-xl border border-border bg-card p-4 space-y-3"
                >
                  <div className="h-4 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-full rounded bg-muted animate-pulse" />
                  <div className="h-3 w-4/5 rounded bg-muted animate-pulse" />
                  <div className="h-3 w-24 rounded bg-muted animate-pulse" />
                </div>
              ))}
            </div>
            {isSlow && (
              <p className="text-xs text-muted-foreground pt-1">
                社区正在启动中，请稍候...
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
