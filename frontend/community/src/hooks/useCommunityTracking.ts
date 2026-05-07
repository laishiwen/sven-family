"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useAuth } from "@/components/auth-context";
import { trackCommunityVisit } from "@/lib/analytics";

export function useCommunityTracking() {
  const pathname = usePathname();
  const { user } = useAuth();
  const prevPath = useRef("");

  useEffect(() => {
    if (pathname && pathname !== prevPath.current) {
      prevPath.current = pathname;
      trackCommunityVisit(pathname, user?.id || null);
    }
  }, [pathname, user?.id]);
}
