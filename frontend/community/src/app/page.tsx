"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { useAuth } from "@/components/auth-context";
import { getSections, listTopics } from "@/lib/bridge-client";
import { MessageSquare, Heart, Search, RefreshCw, Plus } from "lucide-react";

const PAGE_SIZE = 20;
const CACHE_KEY = "home_topics_cache";
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

interface TopicItem {
  id: string;
  title: string;
  author_name: string;
  section_name?: string;
  section_slug?: string;
  tags: string[];
  likes_count: number;
  comments_count: number;
  last_reply_username?: string;
  last_reply_at?: string;
  created_at: string;
}

interface Section {
  id: string;
  name: string;
  slug: string;
}

interface TopicListResponse {
  items?: TopicItem[];
  total?: number;
  page?: number;
  page_size?: number;
}

function formatDate(dateStr: string, t: (key: string, opts?: any) => string) {
  const d = new Date(dateStr);
  const now = new Date();
  const time = d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) return `${t("home.today")} ${time}`;
  if (isYesterday) return `${t("home.yesterday")} ${time}`;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day} ${time}`;
}

function getInitials(name: string) {
  return (name || "?").charAt(0).toUpperCase();
}

function hashString(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getAvatarDesign(seed: string) {
  const emojiPool = [
    "😺",
    "🦊",
    "🐼",
    "🐯",
    "🦁",
    "🐨",
    "🐸",
    "🦄",
    "🐙",
    "🐳",
    "🔥",
    "✨",
  ];
  const hash = hashString(seed);
  const hueA = hash % 360;
  const hueB = (hueA + 42) % 360;
  return {
    emoji: emojiPool[hash % emojiPool.length],
    gradient: `linear-gradient(135deg, hsl(${hueA} 80% 62%), hsl(${hueB} 82% 48%))`,
  };
}

function formatPublishLabel(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  if (!isToday) return null;
  const time = d.toLocaleTimeString("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `今天 ${time}`;
}

function TopicListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-5 rounded-2xl border border-border bg-card shadow-card animate-pulse"
        >
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-full bg-muted" />
            <div className="flex-1 min-w-0">
              <div className="h-4 w-2/3 rounded bg-muted" />
              <div className="mt-2 h-3 w-1/2 rounded bg-muted" />
            </div>
            <div className="h-3 w-14 rounded bg-muted" />
          </div>
          <div className="flex items-center gap-2 mt-3 ml-[52px]">
            <div className="h-5 w-14 rounded-md bg-muted" />
            <div className="h-5 w-10 rounded-md bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function Home() {
  return (
    <div className="min-h-screen">
      <Header />
      <TopicList />
    </div>
  );
}

function TopicList() {
  const { t } = useTranslation();
  const { token } = useAuth();
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [selectedSection, setSelectedSection] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const loadingMoreRef = useRef(false);
  const restoredRef = useRef(false);
  useEffect(() => {
    getSections()
      .then((data) => {
        if (Array.isArray(data)) setSections(data);
      })
      .catch(() => {});

    // Restore from sessionStorage cache
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (raw) {
        const cache = JSON.parse(raw);
        if (Date.now() - cache.timestamp < CACHE_TTL) {
          if (Array.isArray(cache.sections)) setSections(cache.sections);
          setTopics(cache.topics);
          setPage(cache.page);
          setHasMore(cache.hasMore);
          setSelectedSection(cache.selectedSection);
          setSearchQuery(cache.searchQuery);
          setLoading(false);
          restoredRef.current = true;
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              window.scrollTo(0, cache.scrollY ?? 0);
            });
          });
          return;
        }
      }
    } catch {}

    fetchTopics("", "", 1, false);
  }, []);

  const fetchTopics = async (
    section: string,
    search: string,
    pageNumber = 1,
    append = false,
  ) => {
    if (append) {
      setLoadingMore(true);
      loadingMoreRef.current = true;
    } else {
      setLoading(true);
    }

    setFetchError(false);
    const params: Record<string, string> = {
      page: String(pageNumber),
      page_size: String(PAGE_SIZE),
    };
    if (section) params.section = section;
    if (search.trim()) params.search = search.trim();

    try {
      const data = await listTopics(params);

      if (data && Array.isArray(data.items)) {
      const incoming = data.items;
      const loadedCount = append
        ? topics.length + incoming.length
        : incoming.length;
      const nextHasMore =
        typeof data.total === "number"
          ? loadedCount < data.total
          : incoming.length === PAGE_SIZE;

      if (append) {
        setTopics((prev) => {
          const existingIds = new Set(prev.map((item) => item.id));
          const deduped = incoming.filter(
            (item: TopicItem) => !existingIds.has(item.id),
          );
          return [...prev, ...deduped];
        });
      } else {
        setTopics(incoming);
        setPage(1);
      }

      setHasMore(nextHasMore);
      setFetchError(false);
    } else {
      if (!append) setTopics([]);
      setHasMore(false);
      if (!append) setPage(1);
    }
    } catch {
      setFetchError(true);
      if (!append) setTopics([]);
      setHasMore(false);
      if (!append) setPage(1);
    }

    if (append) {
      setLoadingMore(false);
      loadingMoreRef.current = false;
    } else {
      setLoading(false);
    }
  };

  const fetchNextPage = async () => {
    if (loading || loadingMoreRef.current || !hasMore || fetchError) return;
    const nextPage = page + 1;
    setPage(nextPage);
    await fetchTopics(selectedSection, searchQuery, nextPage, true);
  };

  // Fetch on section change
  useEffect(() => {
    if (restoredRef.current) {
      restoredRef.current = false;
      return;
    }
    fetchTopics(selectedSection, searchQuery, 1, false);
  }, [selectedSection]);

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchNextPage();
        }
      },
      { rootMargin: "180px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [page, hasMore, selectedSection, searchQuery, fetchError, loading]);

  // Debounced search
  const handleSearchChange = (value: string) => {
    sessionStorage.removeItem(CACHE_KEY);
    setSearchQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchTopics(selectedSection, value, 1, false);
    }, 300);
  };

  // Clear search when section changes
  const handleSectionChange = (slug: string) => {
    sessionStorage.removeItem(CACHE_KEY);
    setSelectedSection(selectedSection === slug ? "" : slug);
  };

  return (
    <main className="max-w-2xl mx-auto px-5 py-10">
      <div className="mb-8 flex items-end justify-between">
        <div>
          <h1 className="text-3xl font-normal font-serif tracking-tight">
            {t("home.title")}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t("home.subtitle")}
          </p>
        </div>
        {token && (
          <Link
            href="/topics/new"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 transition-colors shrink-0"
          >
            <Plus className="h-3.5 w-3.5" />
            发帖
          </Link>
        )}
      </div>

      {/* Search — inline, debounced */}
      <div className="relative mb-6">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
        <input
          type="search"
          name="search"
          value={searchQuery}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder={t("home.searchPlaceholder")}
          autoComplete="off"
          className="w-full h-11 pl-10 pr-12 rounded-xl border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery("");
              fetchTopics(selectedSection, "", 1, false);
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground hover:text-foreground"
          >
            {t("home.clear")}
          </button>
        )}
      </div>

      {/* Section Tabs */}
      {sections.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-8">
          <button
            onClick={() => setSelectedSection("")}
            className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
              !selectedSection
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("home.all")}
          </button>
          {sections.map((section) => (
            <button
              key={section.id}
              onClick={() => handleSectionChange(section.slug)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                selectedSection === section.slug
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              {section.name}
            </button>
          ))}
        </div>
      )}

      {/* Topic List */}
      {loading ? (
        <TopicListSkeleton count={5} />
      ) : fetchError ? (
        <div className="text-center py-16">
          <p className="text-sm text-muted-foreground">加载失败，请刷新重试</p>
          <button
            onClick={() => fetchTopics(selectedSection, searchQuery, 1, false)}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" /> 重试
          </button>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-16">
          <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-muted-foreground">
            {searchQuery
              ? t("home.noResults", { query: searchQuery })
              : t("home.noPosts")}
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            {searchQuery
              ? t("home.tryOther")
              : selectedSection
                ? t("home.sectionEmpty")
                : t("home.beFirst")}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => {
            const avatar = getAvatarDesign(`${topic.author_name}:${topic.id}`);
            const publishLabel = formatPublishLabel(topic.created_at);
            return (
              <Link
                key={topic.id}
                href={`/topics/${topic.id}`}
                onClick={() => {
                  try {
                    sessionStorage.setItem(
                      CACHE_KEY,
                      JSON.stringify({
                        topics,
                        sections,
                        page,
                        hasMore,
                        selectedSection,
                        searchQuery,
                        scrollY: window.scrollY,
                        timestamp: Date.now(),
                      }),
                    );
                  } catch {}
                }}
                className="block group p-5 rounded-2xl border border-border bg-card shadow-card hover:-translate-y-0.5 hover:shadow-elevated transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div
                    className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base shadow-sm ring-1 ring-black/5 dark:ring-white/10"
                    style={{ backgroundImage: avatar.gradient }}
                  >
                    <span className="drop-shadow-sm">{avatar.emoji}</span>
                    <span className="absolute -right-1 -bottom-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-background/95 px-1 text-[9px] font-semibold text-foreground ring-1 ring-border">
                      {getInitials(topic.author_name)}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-medium font-serif leading-snug group-hover:text-primary/80 transition-colors line-clamp-2">
                      {topic.title}
                    </h3>
                    <div className="flex items-center gap-2 mt-1.5 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">
                        {topic.author_name}
                      </span>
                      {topic.last_reply_username && (
                        <>
                          <span>·</span>
                          <span>
                            {t("home.lastReply")} {topic.last_reply_username}
                          </span>
                        </>
                      )}
                      <span>·</span>
                      {publishLabel ? (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          {publishLabel}
                        </span>
                      ) : (
                        <span>
                          {formatDate(
                            topic.last_reply_at || topic.created_at,
                            t,
                          )}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0 pt-0.5">
                    <span className="flex items-center gap-1">
                      <Heart className="h-3.5 w-3.5" /> {topic.likes_count || 0}
                    </span>
                    <span className="flex items-center gap-1">
                      <MessageSquare className="h-3.5 w-3.5" />{" "}
                      {topic.comments_count || 0}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2 mt-3 ml-[52px]">
                  {topic.section_name && (
                    <span className="px-2 py-0.5 rounded-md text-[10px] bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      {topic.section_name}
                    </span>
                  )}
                  {topic.tags &&
                    topic.tags.slice(0, 2).map((tag) => (
                      <span
                        key={tag}
                        className="px-2 py-0.5 rounded-md text-[10px] bg-accent/60 text-accent-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                </div>
              </Link>
            );
          })}

          <div ref={loadMoreRef} className="h-8" />
          {loadingMore && <TopicListSkeleton count={2} />}
          {!hasMore && topics.length > 0 && (
            <div className="text-center py-3 text-xs text-muted-foreground/70">
              没有更多帖子了
            </div>
          )}
        </div>
      )}
    </main>
  );
}
