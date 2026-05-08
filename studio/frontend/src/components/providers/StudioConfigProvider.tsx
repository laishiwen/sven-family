"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getStatsUrl, getCommunityUrl, prewarmServiceUrls } from "@/lib/external-services";

interface StudioConfig {
  statsUrl: string;
  communityUrl: string;
}

const FALLBACK_STATS_URL = import.meta.env.VITE_STATS_API_URL || "";
const FALLBACK_COMMUNITY_URL = import.meta.env.VITE_COMMUNITY_URL || "";

const StudioConfigContext = createContext<StudioConfig>({
  statsUrl: FALLBACK_STATS_URL,
  communityUrl: FALLBACK_COMMUNITY_URL,
});

export function useStudioConfig() {
  return useContext(StudioConfigContext);
}

export function StudioConfigProvider({ children }: { children: ReactNode }) {
  const [statsUrl, setStatsUrl] = useState(FALLBACK_STATS_URL);
  const [communityUrl, setCommunityUrl] = useState(FALLBACK_COMMUNITY_URL);

  useEffect(() => {
    let cancelled = false;

    void Promise.all([getStatsUrl(), getCommunityUrl()]).then(
      ([resolvedStats, resolvedCommunity]) => {
        if (cancelled) return;
        setStatsUrl(resolvedStats);
        setCommunityUrl(resolvedCommunity);
      },
    );

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <StudioConfigContext.Provider value={{ statsUrl, communityUrl }}>
      {children}
    </StudioConfigContext.Provider>
  );
}

/** Pre-warm probes without waiting. Call early in app lifecycle. */
export { prewarmServiceUrls };
