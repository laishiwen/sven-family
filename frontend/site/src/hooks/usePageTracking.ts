"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { getAnalytics } from "@/lib/analytics";

export function usePageTracking() {
  const pathname = usePathname();

  useEffect(() => {
    const tracker = getAnalytics();
    if (tracker && pathname) {
      tracker.trackPageView(pathname);
    }
  }, [pathname]);
}
