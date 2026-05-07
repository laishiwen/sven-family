/**
 * Community analytics tracker - silent fire-and-forget
 * Reports community_visit events to stats-service.
 * No user-facing notifications on success or failure.
 */

const STATS_URL =
  typeof process !== "undefined" && process.env.NEXT_PUBLIC_STATS_API_URL;

function getSessionId(): string {
  if (typeof window === "undefined") return "server-" + Date.now();
  const key = "community_analytics_session";
  let sid = localStorage.getItem(key);
  if (!sid) {
    sid =
      "community_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(key, sid);
  }
  return sid;
}

const seenKeys = new Set<string>();

/**
 * Track a community page visit.
 * @param pagePath - current page path
 * @param communityUserId - null for anonymous, string for registered user
 */
export function trackCommunityVisit(
  pagePath: string,
  communityUserId?: string | null,
) {
  if (typeof window === "undefined") return;

  // Dedup: same page + session + hour window
  const hourKey = `${pagePath}_${communityUserId || "anon"}_${Math.floor(Date.now() / 3600000)}`;
  if (seenKeys.has(hourKey)) return;
  seenKeys.add(hourKey);

  const payload = JSON.stringify({
    source: "community",
    events: [
      {
        type: "community_visit",
        timestamp: Date.now(),
        page: pagePath,
        referrer: document.referrer || undefined,
        community_user_id: communityUserId || null,
      },
    ],
    session_id: getSessionId(),
  });

  try {
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon(`${STATS_URL}/api/v1/track/event`, blob);
    } else {
      fetch(`${STATS_URL}/api/v1/track/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    // silent
  }
}
