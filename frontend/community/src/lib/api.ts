/**
 * Axios-based HTTP client for Community app.
 * All API calls go directly to the Python backend
 */

import axios from "axios";

const BRIDGE_URL =
  typeof window === "undefined"
    ? process.env.BRIDGE_API_URL || process.env.NEXT_PUBLIC_BRIDGE_API_URL
    : process.env.NEXT_PUBLIC_BRIDGE_API_URL;

export const bridgeApi = axios.create({
  baseURL: BRIDGE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

// Auto-attach JWT token from localStorage on client-side requests
bridgeApi.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    try {
      const token = localStorage.getItem("community_token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch {}
  }
  return config;
});

bridgeApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const detail = err.response?.data?.detail || err.message || "Bridge error";
    return Promise.reject(new Error(detail));
  },
);
