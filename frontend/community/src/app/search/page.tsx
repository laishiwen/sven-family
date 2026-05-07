"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Header } from "@/components/header";
import { searchTopics } from "@/lib/bridge-client";
import { MessageSquare, Heart, Search } from "lucide-react";

interface TopicItem {
  id: string;
  title: string;
  content: string;
  author_name: string;
  tags: string[];
  likes_count: number;
  comments_count: number;
  created_at: string;
}

function formatDate(dateStr: string, t: (key: string, opts?: any) => string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return t("search.today");
  if (days === 1) return t("search.yesterday");
  if (days < 7) return t("search.daysAgo", { count: days });
  if (days < 30) return t("search.weeksAgo", { count: Math.floor(days / 7) });
  return d.toLocaleDateString();
}

function SearchTopicListSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="p-4 rounded-lg border border-border bg-card animate-pulse"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="h-4 w-2/3 rounded bg-muted" />
            <div className="h-3 w-16 rounded bg-muted" />
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className="h-4 w-10 rounded bg-muted" />
            <div className="h-4 w-12 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted ml-auto" />
          </div>
        </div>
      ))}
    </div>
  );
}

function SearchResults() {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") || "";
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!q.trim()) {
      setLoading(false);
      return;
    }
    const fetchResults = async () => {
      setLoading(true);
      try {
        const data = await searchTopics(q);
        setTopics(data.items || []);
      } catch (e) {
        console.error("Search failed", e);
      }
      setLoading(false);
    };
    fetchResults();
  }, [q]);

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold">{t("search.title")}</h2>
        <p className="text-xs text-muted-foreground">
          {q ? t("search.resultsFor", { query: q }) : t("search.enterQuery")}
        </p>
      </div>

      {loading ? (
        <SearchTopicListSkeleton count={4} />
      ) : !q.trim() ? (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("search.enterTerm")}</p>
        </div>
      ) : topics.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Search className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">{t("search.noResults", { query: q })}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {topics.map((topic) => (
            <Link
              key={topic.id}
              href={`/topics/${topic.id}`}
              className="block p-4 rounded-lg border hover:border-primary/40 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-medium truncate">{topic.title}</h3>
                <div className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                  <span className="flex items-center gap-0.5">
                    <Heart className="h-3 w-3" /> {topic.likes_count}
                  </span>
                  <span className="flex items-center gap-0.5">
                    <MessageSquare className="h-3 w-3" /> {topic.comments_count}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                {Array.isArray(topic.tags) &&
                  topic.tags.slice(0, 3).map((tag: string) => (
                    <span
                      key={tag}
                      className="px-1.5 py-0.5 rounded text-[10px] bg-accent text-accent-foreground"
                    >
                      {tag}
                    </span>
                  ))}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {topic.author_name} · {formatDate(topic.created_at, t)}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </main>
  );
}

export default function SearchPage() {
  return (
    <div className="min-h-screen">
      <Header />
      <Suspense
        fallback={
          <main className="max-w-4xl mx-auto px-4 py-6">
            <SearchTopicListSkeleton count={4} />
          </main>
        }
      >
        <SearchResults />
      </Suspense>
    </div>
  );
}
