/**
 * Download utilities with analytics tracking
 */

import { getAnalytics } from "./analytics";

export interface DownloadOptions {
  fileId: string;
  fileName: string;
  fileSize?: number;
  url: string;
}

/**
 * Download file and track the download event
 */
export async function downloadWithTracking(
  options: DownloadOptions,
): Promise<void> {
  const { fileId, fileName, fileSize, url } = options;

  // Track download
  const tracker = getAnalytics();
  if (tracker) {
    tracker.trackDownload(fileId, fileName, fileSize);
  }

  // Trigger download
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Track a download without triggering browser download
 */
export function trackDownloadOnly(
  fileId: string,
  fileName: string,
  fileSize?: number,
): void {
  const tracker = getAnalytics();
  if (tracker) {
    tracker.trackDownload(fileId, fileName, fileSize);
  }
}
