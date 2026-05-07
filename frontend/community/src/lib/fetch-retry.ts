/**
 * Axios-based HTTP client with retry on 503 / network errors.
 * Retries up to `maxRetries` times with exponential backoff.
 * Replaces the previous bare fetch() implementation.
 */

import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

const api = axios.create({
  baseURL: "",
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
}

export async function fetchWithRetry<T = any>(
  url: string,
  config?: AxiosRequestConfig,
  options: RetryOptions = {},
): Promise<AxiosResponse<T>> {
  const { maxRetries = 3, baseDelay = 1000 } = options;

  for (let i = 0; i <= maxRetries; i++) {
    try {
      const res = await api.request<T>({ url, ...config });
      return res;
    } catch (err: any) {
      const status = err.response?.status;
      // 503 or network error -> retry
      if ((status === 503 || !status) && i < maxRetries) {
        await sleep(baseDelay * Math.pow(2, i));
        continue;
      }
      throw err;
    }
  }
  // Unreachable; satisfy TypeScript
  throw new Error("fetchWithRetry: max retries exhausted");
}

/**
 * Convenience: fetch + JSON parse with retry.
 * Returns `{ data, error }` so callers can handle gracefully.
 */
export async function fetchJSONWithRetry<T = any>(
  url: string,
  config?: AxiosRequestConfig,
  options?: RetryOptions,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await fetchWithRetry<T>(url, config, options);
    return { data: res.data, error: null };
  } catch (err: any) {
    const detail = err.response?.data?.detail || err.message || "Network error";
    return { data: null, error: detail };
  }
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
