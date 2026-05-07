import axios from "axios";
import { useAuthStore } from "@/stores/authStore";

export const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8001";

export const api = axios.create({
  baseURL: `${API_BASE}/api/v1`,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

// ── Auth expiry event (decoupled from React to work inside interceptors) ─────
export const AUTH_EXPIRED_EVENT = "sven:auth-expired";
let _authExpiredFired = false;

export function resetAuthExpiredFlag() {
  _authExpiredFired = false;
}

function fireAuthExpired() {
  if (_authExpiredFired) return; // prevent duplicate redirects
  _authExpiredFired = true;
  useAuthStore.getState().logout();
  window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT));
}

// Attach JWT token from auth store
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (res) => res,
  (err) => {
    const status = err.response?.status;
    const detail = err.response?.data?.detail;
    const message = detail || err.message || "Network Error";

    // Don't log 401 as error — it's an auth expiry, not a bug
    if (status === 401) {
      fireAuthExpired();
    } else {
      console.error(`API Error [${status}]: ${message}`);
    }

    return Promise.reject(err);
  },
);

// ── Auth ────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post("/auth/login", { email, password }),
  me: () => api.get("/auth/me"),
};

// ── Admin Users (System Management) ───────────────────────────────────────
export const adminUsersApi = {
  list: () => api.get("/auth/admins"),
  create: (data: {
    username: string;
    email: string;
    password: string;
    role: string;
  }) => api.post("/auth/admins", data),
  update: (id: string, data: Record<string, unknown>) =>
    api.put(`/auth/admins/${id}`, data),
  delete: (id: string) => api.delete(`/auth/admins/${id}`),
};

// ── Community ──────────────────────────────────────────────────────────────
export const communityApi = {
  // Users
  listUsers: (params?: Record<string, unknown>) =>
    api.get("/community/users", { params }),
  getUser: (id: string) => api.get(`/community/users/${id}`),
  createUser: (data: unknown) => api.post("/community/users", data),
  updateUser: (id: string, data: unknown) =>
    api.put(`/community/users/${id}`, data),
  deleteUser: (id: string) => api.delete(`/community/users/${id}`),
  banUser: (id: string) => api.post(`/community/users/${id}/ban`),
  unbanUser: (id: string) => api.post(`/community/users/${id}/unban`),
  // Posts
  listPosts: (params?: Record<string, unknown>) =>
    api.get("/community/posts", { params }),
  getPost: (id: string) => api.get(`/community/posts/${id}`),
  createPost: (data: unknown) => api.post("/community/posts", data),
  updatePost: (id: string, data: unknown) =>
    api.put(`/community/posts/${id}`, data),
  deletePost: (id: string) => api.delete(`/community/posts/${id}`),
  batchDeletePosts: (postIds: string[]) =>
    api.post("/community/posts/batch-delete", { post_ids: postIds }),
  // Sections
  getSections: () => api.get("/community/sections"),
  createSection: (data: unknown) => api.post("/community/sections", data),
  updateSection: (id: string, data: unknown) =>
    api.put(`/community/sections/${id}`, data),
  deleteSection: (id: string) => api.delete(`/community/sections/${id}`),
};

// ── Memberships ────────────────────────────────────────────────────────────
export const membershipsApi = {
  list: (params?: Record<string, unknown>) =>
    api.get("/memberships", { params }),
  create: (data: unknown) => api.post("/memberships", data),
  update: (id: string, data: unknown) => api.put(`/memberships/${id}`, data),
  delete: (id: string) => api.delete(`/memberships/${id}`),
};

// ── Orders ─────────────────────────────────────────────────────────────────
export const ordersApi = {
  list: (params?: Record<string, unknown>) => api.get("/orders", { params }),
  get: (id: string) => api.get(`/orders/${id}`),
  update: (id: string, data: unknown) => api.put(`/orders/${id}`, data),
  refund: (id: string) => api.post(`/orders/${id}/refund`),
};

// ── Crawler ────────────────────────────────────────────────────────────────
export const crawlerApi = {
  list: (params?: Record<string, unknown>) => api.get("/crawler", { params }),
  overview: () => api.get("/crawler/overview"),
  listJobs: () => api.get("/crawler/jobs"),
  updateJob: (id: string, data: unknown) =>
    api.put(`/crawler/jobs/${id}`, data),
  triggerJob: (id: string) => api.post(`/crawler/jobs/${id}/trigger`),
  createJob: (data: unknown) => api.post("/crawler/jobs", data),
  deleteJob: (id: string) => api.delete(`/crawler/jobs/${id}`),
  create: (data: unknown) => api.post("/crawler", data),
  get: (id: string) => api.get(`/crawler/${id}`),
  delete: (id: string) => api.delete(`/crawler/${id}`),
  update: (id: string, data: unknown) => api.put(`/crawler/${id}`, data),
  trigger: (id: string) => api.post(`/crawler/${id}/trigger`),
};

// ── Analytics ──────────────────────────────────────────────────────────────
export const analyticsApi = {
  pageViews: (params?: Record<string, unknown>) =>
    api.get("/analytics/page-views", { params }),
  timeline: (params?: Record<string, unknown>) =>
    api.get("/analytics/page-views/timeline", { params }),
  downloads: (params?: Record<string, unknown>) =>
    api.get("/analytics/downloads", { params }),
  overview: () => api.get("/analytics/overview"),
};

// ── Stats (三端统计) ──────────────────────────────────────────────────────
export const statsApi = {
  site: {
    visits: (params?: Record<string, unknown>) => api.get("/site-stats/site/visits", { params }),
    trend: (params?: Record<string, unknown>) => api.get("/site-stats/site/trend", { params }),
    topPages: (params?: Record<string, unknown>) => api.get("/site-stats/site/top-pages", { params }),
    downloads: (params?: Record<string, unknown>) => api.get("/site-stats/site/downloads", { params }),
    details: (params?: Record<string, unknown>) => api.get("/site-stats/site/details", { params }),
  },
  desktop: {
    stats: (params?: Record<string, unknown>) => api.get("/site-stats/desktop/stats", { params }),
    trend: (params?: Record<string, unknown>) => api.get("/site-stats/desktop/trend", { params }),
    platforms: (params?: Record<string, unknown>) => api.get("/site-stats/desktop/platforms", { params }),
    details: (params?: Record<string, unknown>) => api.get("/site-stats/desktop/details", { params }),
  },
  community: {
    stats: (params?: Record<string, unknown>) => api.get("/site-stats/community/stats", { params }),
    trend: (params?: Record<string, unknown>) => api.get("/site-stats/community/trend", { params }),
    topPages: (params?: Record<string, unknown>) => api.get("/site-stats/community/top-pages", { params }),
    details: (params?: Record<string, unknown>) => api.get("/site-stats/community/details", { params }),
  },
};

// ── Settings ───────────────────────────────────────────────────────────────
export const settingsApi = {
  get: () => api.get("/settings"),
  update: (data: unknown) => api.put("/settings", data),
};

// ── Dashboard ──────────────────────────────────────────────────────────────
export const dashboardApi = {
  stats: () => api.get("/dashboard/stats"),
};
