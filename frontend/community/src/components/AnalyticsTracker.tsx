"use client";

import { useCommunityTracking } from "@/hooks/useCommunityTracking";

export function AnalyticsTracker() {
  useCommunityTracking();
  return null;
}
