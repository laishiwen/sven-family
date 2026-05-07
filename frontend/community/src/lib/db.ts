import fs from "fs";
import path from "path";

const DATA_DIR = process.env.DATA_DIR || "data";

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(name: string) {
  return path.join(DATA_DIR, `${name}.json`);
}

function read<T>(table: string): T[] {
  ensureDir();
  const fp = filePath(table);
  if (!fs.existsSync(fp)) return [];
  const raw = fs.readFileSync(fp, "utf-8");
  return raw.trim() ? JSON.parse(raw) : [];
}

function write<T>(table: string, data: T[]) {
  ensureDir();
  const fp = filePath(table);
  const tmp = fp + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, fp);
}

export function genId(): string {
  return crypto.randomUUID();
}

// ── Table helpers ──────────────────────────────────────────────

export const users = {
  all: () => read<Record<string, unknown>>("users"),
  findById: (id: string) => read<Record<string, unknown>>("users").find((u) => u.id === id),
  findByEmail: (email: string) => read<Record<string, unknown>>("users").find((u) => u.email === email),
  insert: (user: Record<string, unknown>) => {
    const rows = read<Record<string, unknown>>("users");
    rows.push(user);
    write("users", rows);
  },
};

export const topics = {
  all: () => read<Record<string, unknown>>("topics"),
  findById: (id: string) => read<Record<string, unknown>>("topics").find((t) => t.id === id),
  insert: (topic: Record<string, unknown>) => {
    const rows = read<Record<string, unknown>>("topics");
    rows.push(topic);
    write("topics", rows);
  },
  update: (id: string, updates: Record<string, unknown>) => {
    const rows = read<Record<string, unknown>>("topics");
    const idx = rows.findIndex((t) => t.id === id);
    if (idx >= 0) {
      rows[idx] = { ...rows[idx], ...updates };
      write("topics", rows);
    }
  },
  delete: (id: string) => {
    const rows = read<Record<string, unknown>>("topics");
    write("topics", rows.filter((t) => t.id !== id));
  },
  count: () => read<Record<string, unknown>>("topics").length,
};

export const comments = {
  all: () => read<Record<string, unknown>>("comments"),
  findByTopic: (topicId: string) =>
    read<Record<string, unknown>>("comments").filter((c) => c.topic_id === topicId),
  insert: (comment: Record<string, unknown>) => {
    const rows = read<Record<string, unknown>>("comments");
    rows.push(comment);
    write("comments", rows);
  },
};

export const likes = {
  all: () => read<Record<string, unknown>>("likes"),
  find: (userId: string, topicId: string) =>
    read<Record<string, unknown>>("likes").find(
      (l) => l.user_id === userId && l.topic_id === topicId
    ),
  insert: (like: Record<string, unknown>) => {
    const rows = read<Record<string, unknown>>("likes");
    rows.push(like);
    write("likes", rows);
  },
  delete: (userId: string, topicId: string) => {
    const rows = read<Record<string, unknown>>("likes");
    write(
      "likes",
      rows.filter((l) => !(l.user_id === userId && l.topic_id === topicId))
    );
  },
};
