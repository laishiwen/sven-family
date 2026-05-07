/**
 * HTTP client for the Community Bridge Server.
 * Token is auto-attached by the bridgeApi interceptor.
 */

import { bridgeApi } from "@/lib/api";

// ── Auth ──────────────────────────────────────────────────────

export async function loginAPI(email: string, password: string) {
  const res = await bridgeApi.post("/api/auth/login", { email, password });
  return res.data;
}

export async function registerAPI(email: string, username: string, password: string) {
  const res = await bridgeApi.post("/api/auth/register", { email, username, password });
  return res.data;
}

// ── Sections ─────────────────────────────────────────────────

export async function getSections() {
  const res = await bridgeApi.get("/api/sections");
  return res.data;
}

// ── Topics ───────────────────────────────────────────────────

export async function listTopics(params?: Record<string, string>) {
  const res = await bridgeApi.get("/api/topics", { params });
  return res.data;
}

export async function getTopic(id: string) {
  const res = await bridgeApi.get(`/api/topics/${id}`);
  return res.data;
}

export async function createTopic(data: Record<string, unknown>) {
  const res = await bridgeApi.post("/api/topics", data);
  return res.data;
}

export async function updateTopic(id: string, data: Record<string, unknown>) {
  const res = await bridgeApi.put(`/api/topics/${id}`, data);
  return res.data;
}

export async function deleteTopic(id: string) {
  const res = await bridgeApi.delete(`/api/topics/${id}`);
  return res.data;
}

// ── Comments ─────────────────────────────────────────────────

export async function listComments(topicId: string) {
  const res = await bridgeApi.get(`/api/topics/${topicId}/comments`);
  return res.data;
}

export async function createComment(topicId: string, data: Record<string, unknown>) {
  const res = await bridgeApi.post(`/api/topics/${topicId}/comments`, data);
  return res.data;
}

// ── Likes ────────────────────────────────────────────────────

export async function toggleLike(topicId: string) {
  const res = await bridgeApi.post(`/api/topics/${topicId}/like`);
  return res.data;
}

// ── Reactions ────────────────────────────────────────────────

export async function toggleReaction(data: {
  target_type: "post" | "comment";
  target_id: string;
  emoji: string;
}) {
  const res = await bridgeApi.post("/api/reactions", data);
  return res.data;
}

export async function getReactions(targetType: string, targetId: string) {
  const res = await bridgeApi.get(`/api/reactions/${targetType}/${targetId}`);
  return res.data;
}

// ── Tags ─────────────────────────────────────────────────────

export async function getTags() {
  const res = await bridgeApi.get("/api/tags");
  return res.data;
}

// ── Search ───────────────────────────────────────────────────

export async function searchTopics(q: string, page = 1, pageSize = 20) {
  const res = await bridgeApi.get("/api/search", {
    params: { q, page, page_size: pageSize },
  });
  return res.data;
}
