/**
 * Desktop analytics tracker - silent fire-and-forget
 * Reports app_open events to stats-service for desktop usage statistics.
 * No user-facing notifications on success or failure.
 */

const STATS_URL = (typeof window !== "undefined" && (window as any).__STATS_API_URL__) || "http://localhost:8002";

interface DesktopEvent {
  type: "app_open";
  timestamp: number;
  page?: string;
  os_name?: string;
  os_version?: string;
  cpu_arch?: string;
  app_version?: string;
  machine_info?: Record<string, string>;
}

function getOSInfo() {
  if (typeof window === "undefined") return {};
  const ua = navigator.userAgent;
  let os_name = "unknown";
  let os_version = "";
  if (ua.includes("Mac")) { os_name = "macOS"; }
  else if (ua.includes("Win")) { os_name = "Windows"; }
  else if (ua.includes("Linux")) { os_name = "Linux"; }
  else if (ua.includes("Android")) { os_name = "Android"; }
  else if (ua.includes("iOS") || ua.includes("iPhone") || ua.includes("iPad")) { os_name = "iOS"; }
  return {
    os_name,
    os_version: "",
    cpu_arch: navigator.platform || "",
    machine_info: {
      platform: navigator.platform || "",
      language: navigator.language || "",
      screenSize: `${window.screen.width}x${window.screen.height}`,
      colorDepth: String(window.screen.colorDepth || 0),
    },
  };
}

function getSessionId(): string {
  if (typeof window === "undefined") return "server-" + Date.now();
  const key = "studio_analytics_session";
  let sid = localStorage.getItem(key);
  if (!sid) {
    sid = "studio_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(key, sid);
  }
  return sid;
}

let lastPagePath = "";
const seenKeys = new Set<string>();

export function trackAppOpen(pagePath?: string) {
  if (typeof window === "undefined") return;

  const path = pagePath || window.location.pathname;
  // Dedup within session: same page within 1 hour = single event
  const hourKey = `${path}_${Math.floor(Date.now() / 3600000)}`;
  if (seenKeys.has(hourKey)) return;
  seenKeys.add(hourKey);

  const os = getOSInfo();
  const event: DesktopEvent = {
    type: "app_open",
    timestamp: Date.now(),
    page: path,
    ...os,
  };

  const payload = JSON.stringify({
    source: "desktop",
    events: [event],
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
    // silent — never alert the user
  }
}

/**
 * Call once on app mount. Tracks initial page and sets up history listener.
 */
export function initDesktopTracking() {
  if (typeof window === "undefined") return;
  trackAppOpen();
}
