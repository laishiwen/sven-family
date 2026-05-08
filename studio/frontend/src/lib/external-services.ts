/**
 * External service URL resolution with health-check probing.
 * Tries production URLs first, falls back to localhost if unreachable.
 * Results are cached in sessionStorage for the duration of the browser session.
 */

const PROBE_TIMEOUT_MS = 3000;
const CACHE_KEY_STATS = "studio_external_stats_url";
const CACHE_KEY_COMMUNITY = "studio_external_community_url";

const PROD_STATS_URL = import.meta.env.VITE_PROD_STATS_API_URL;
const FALLBACK_STATS_URL = import.meta.env.VITE_STATS_API_URL;

const PROD_COMMUNITY_URL = import.meta.env.VITE_PROD_COMMUNITY_URL;
const FALLBACK_COMMUNITY_URL = import.meta.env.VITE_COMMUNITY_URL;

async function probeUrl(url: string, timeout = PROBE_TIMEOUT_MS): Promise<boolean> {
  try {
    await fetch(url, {
      method: "HEAD",
      mode: "no-cors",
      signal: AbortSignal.timeout(timeout),
    });
    return true;
  } catch {
    // Only TypeError (DNS, connection refused, timeout) reaches here — unreachable
    return false;
  }
}

async function resolveServiceUrl(
  productionUrl: string | undefined,
  probePath: string,
  fallbackUrl: string,
  cacheKey: string,
): Promise<string> {
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return cached;
  } catch {}

  // No production URL configured → use fallback directly
  if (!productionUrl) {
    return fallbackUrl;
  }

  const reachable = await probeUrl(`${productionUrl}${probePath}`);
  const resolved = reachable ? productionUrl : fallbackUrl;

  try {
    sessionStorage.setItem(cacheKey, resolved);
  } catch {}

  return resolved;
}

// ── Public API ──────────────────────────────────────────────────

let statsUrlPromise: Promise<string> | null = null;
let communityUrlPromise: Promise<string> | null = null;

export function getStatsUrl(): Promise<string> {
  if (!statsUrlPromise) {
    statsUrlPromise = resolveServiceUrl(PROD_STATS_URL, "/health", FALLBACK_STATS_URL, CACHE_KEY_STATS);
  }
  return statsUrlPromise;
}

export function getCommunityUrl(): Promise<string> {
  if (!communityUrlPromise) {
    communityUrlPromise = resolveServiceUrl(PROD_COMMUNITY_URL, "/", FALLBACK_COMMUNITY_URL, CACHE_KEY_COMMUNITY);
  }
  return communityUrlPromise;
}

/** Pre-warm: trigger probes early so results are ready when UI needs them. */
export function prewarmServiceUrls(): void {
  void getStatsUrl();
  void getCommunityUrl();
}
