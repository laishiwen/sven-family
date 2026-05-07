/**
 * Analytics Tracker SDK
 * 用于官网前端上报访问和下载统计
 */

interface TrackEvent {
  type: "page_view" | "download";
  timestamp: number;
  page?: string;
  referrer?: string;
  file_id?: string;
  file_name?: string;
  file_size?: number;
}

interface AnalyticsConfig {
  apiUrl: string;
  batchSize?: number;
  flushInterval?: number;
  enableLogging?: boolean;
}

export class AnalyticsTracker {
  private apiUrl: string;
  private batchQueue: TrackEvent[] = [];
  private batchSize: number;
  private flushInterval: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private sessionId: string;
  private debug: boolean;

  constructor(config: AnalyticsConfig) {
    this.apiUrl = config.apiUrl;
    this.batchSize = config.batchSize || 10;
    this.flushInterval = config.flushInterval || 5000;
    this.debug = config.enableLogging || false;
    this.sessionId = this.generateSessionId();

    // Auto flush on page unload
    if (typeof window !== "undefined") {
      window.addEventListener("beforeunload", () => {
        this.flush();
      });
    }

    if (this.debug) {
      console.log(
        "[Analytics] Tracker initialized with session:",
        this.sessionId,
      );
    }
  }

  /**
   * Track a page view
   */
  trackPageView(pathname: string, referrer?: string): void {
    this.enqueueEvent({
      type: "page_view",
      page: pathname,
      referrer:
        referrer ||
        (typeof document !== "undefined" ? document.referrer : undefined),
      timestamp: Date.now(),
    });
  }

  /**
   * Track a download event
   */
  trackDownload(fileId: string, fileName: string, fileSize?: number): void {
    this.enqueueEvent({
      type: "download",
      file_id: fileId,
      file_name: fileName,
      file_size: fileSize,
      timestamp: Date.now(),
    });
  }

  /**
   * Queue an event and check if we should flush
   */
  private enqueueEvent(event: TrackEvent): void {
    this.batchQueue.push(event);

    if (this.debug) {
      console.log(
        "[Analytics] Event queued:",
        event,
        "Queue size:",
        this.batchQueue.length,
      );
    }

    // Flush if batch is full
    if (this.batchQueue.length >= this.batchSize) {
      this.flush();
    } else if (!this.flushTimer) {
      // Set timer for auto-flush
      this.flushTimer = setTimeout(() => {
        this.flush();
      }, this.flushInterval);
    }
  }

  /**
   * Send all queued events to the server
   */
  async flush(): Promise<void> {
    if (this.batchQueue.length === 0) {
      return;
    }

    const events = this.batchQueue.splice(0);

    if (this.debug) {
      console.log("[Analytics] Flushing", events.length, "events");
    }

    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }

    try {
      // Use navigator.sendBeacon for better reliability
      if (typeof navigator !== "undefined" && navigator.sendBeacon) {
        const payload = JSON.stringify({
          events,
          session_id: this.sessionId,
        });

        const url = new URL("/api/v1/track/events", this.apiUrl).toString();
        const blob = new Blob([payload], { type: "application/json" });
        const sent = navigator.sendBeacon(url, blob);

        if (this.debug) {
          console.log("[Analytics] sendBeacon result:", sent);
        }
      } else {
        // Fallback to fetch
        await fetch(new URL("/api/v1/track/events", this.apiUrl).toString(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            events,
            session_id: this.sessionId,
          }),
          keepalive: true,
        });

        if (this.debug) {
          console.log("[Analytics] Sent via fetch");
        }
      }
    } catch (error) {
      console.error("[Analytics] Error flushing events:", error);
      // Re-queue events on failure
      this.batchQueue.unshift(...events);
    }
  }

  /**
   * Generate or retrieve session ID
   */
  private generateSessionId(): string {
    if (typeof window === "undefined") {
      return "server-" + Date.now();
    }

    const storageKey = "analytics_session_id";
    let sessionId = localStorage.getItem(storageKey);

    if (!sessionId) {
      sessionId =
        "session_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9);
      localStorage.setItem(storageKey, sessionId);
    }

    return sessionId;
  }

  /**
   * Get current session ID
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Clear session and flush events
   */
  async clear(): Promise<void> {
    await this.flush();
    if (typeof window !== "undefined") {
      localStorage.removeItem("analytics_session_id");
    }
  }
}

/**
 * Global tracker instance
 */
let globalTracker: AnalyticsTracker | null = null;

/**
 * Initialize and get global tracker instance
 */
export function initAnalytics(config: AnalyticsConfig): AnalyticsTracker {
  if (!globalTracker) {
    globalTracker = new AnalyticsTracker(config);
  }
  return globalTracker;
}

/**
 * Get global tracker instance
 */
export function getAnalytics(): AnalyticsTracker | null {
  return globalTracker;
}

export default AnalyticsTracker;
