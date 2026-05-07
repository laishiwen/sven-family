"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth-context";
import { Header } from "@/components/header";
import { getTopic, toggleLike, toggleReaction, createComment, updateTopic, deleteTopic } from "@/lib/bridge-client";
import {
  Heart,
  MessageSquare,
  Trash2,
  ArrowLeft,
  Edit3,
  Smile,
  CornerDownRight,
  RefreshCw,
} from "lucide-react";
import Link from "next/link";

interface TopicDetail {
  id: string;
  title: string;
  content: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  section_name: string;
  section_slug: string;
  tags: string[];
  likes_count: number;
  comments_count: number;
  liked: boolean;
  my_reactions?: string[];
  reactions?: Array<{ emoji: string; count: number }>;
  comments?: CommentItem[];
  created_at: string;
  updated_at: string;
}

interface CommentItem {
  id: string;
  topic_id: string;
  author_id: string;
  author_name: string;
  author_avatar: string;
  author_location?: string;
  content: string;
  parent_id: string | null;
  replies?: CommentItem[];
  reactions?: Array<{ emoji: string; count: number }>;
  my_reactions?: string[];
  created_at: string;
}

const EMOJI_LIST = [
  "❤️", "👍", "🎉", "🚀", "👀", "💡", "🔥", "✅", "🤔", "🙏", "😂", "⭐",
];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("zh-CN", {
    year: "numeric", month: "long", day: "numeric",
  });
}

function formatTime(dateStr: string, t: (key: string, opts?: any) => string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return t("topic.justNow");
  if (hours < 24) return t("topic.hoursAgo", { count: hours });
  return t("topic.daysAgo", { count: Math.floor(hours / 24) });
}

function getInitials(name: string) {
  return (name || "?").charAt(0).toUpperCase();
}

export default function TopicDetailPage() {
  const { t } = useTranslation();
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [topic, setTopic] = useState<TopicDetail | null>(null);
  const [comments, setComments] = useState<CommentItem[]>([]);
  const [commentText, setCommentText] = useState("");
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [showEmoji, setShowEmoji] = useState("");
  const [showCommentEmoji, setShowCommentEmoji] = useState("");
  const [loading, setLoading] = useState(true);
  const [commenting, setCommenting] = useState(false);
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  const topicId = params.id as string;

  const fetchTopic = async () => {
    setLoading(true);
    setFetchError(false);
    try {
      const data = await getTopic(topicId);
      if (data && data.id) {
        setTopic(data);
        if (data.comments) setComments(data.comments);
        setFetchError(false);
      } else {
        setTopic(null);
      }
    } catch {
      setFetchError(true);
      setTopic(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchTopic();
  }, [topicId]);

  const handleLike = async () => {
    if (!user || !topic) return;
    try {
      const data = await toggleLike(topicId);
      setTopic({ ...topic, liked: data.liked, likes_count: data.likes_count });
    } catch {}
  };

  const handleReaction = async (
    targetType: "post" | "comment",
    targetId: string,
    emoji: string,
  ) => {
    if (!user) return;
    try {
      const data = await toggleReaction({
        target_type: targetType,
        target_id: targetId,
        emoji,
      });
      if (targetType === "post" && topic) {
        setTopic({
          ...topic,
          reactions: data.reactions,
          my_reactions: data.added
            ? [...(topic.my_reactions || []), emoji]
            : (topic.my_reactions || []).filter((e) => e !== emoji),
        });
      }
      if (targetType === "comment") {
        setComments((prev) => {
          const update = (items: CommentItem[]): CommentItem[] =>
            items.map((c) => {
              if (c.id === targetId) {
                return {
                  ...c,
                  reactions: data.reactions,
                  my_reactions: data.added
                    ? [...(c.my_reactions || []), emoji]
                    : (c.my_reactions || []).filter((e: string) => e !== emoji),
                };
              }
              if (c.replies) return { ...c, replies: update(c.replies) };
              return c;
            });
          return update(prev);
        });
      }
      setShowEmoji("");
      setShowCommentEmoji("");
    } catch {}
  };

  const handleComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !commentText.trim()) return;
    setCommenting(true);
    try {
      const newComment = await createComment(topicId, {
        content: commentText,
        parent_id: replyTo?.id || null,
      });
      setCommentText("");
      setReplyTo(null);
      if (!replyTo?.id) {
        setComments((prev) => [newComment, ...prev]);
      } else {
        setComments((prev) => {
          const update = (items: CommentItem[]): CommentItem[] =>
            items.map((c) => {
              if (c.id === replyTo!.id) {
                return { ...c, replies: [...(c.replies || []), newComment] };
              }
              if (c.replies) return { ...c, replies: update(c.replies) };
              return c;
            });
          return update(prev);
        });
      }
      if (topic) setTopic({ ...topic, comments_count: (topic.comments_count || 0) + 1 });
    } catch {}
    setCommenting(false);
  };

  const handleEdit = async () => {
    if (!user || !topic) return;
    if (editing) {
      try {
        const updated = await updateTopic(topicId, {
          title: editTitle,
          content: editContent,
        });
        setTopic({
          ...topic,
          title: updated.title,
          content: updated.content,
        });
        setEditing(false);
      } catch {}
    } else {
      setEditTitle(topic.title);
      setEditContent(topic.content);
      setEditing(true);
    }
  };

  const handleDelete = async () => {
    if (!user || !topic) return;
    if (!confirm(t("topic.deleteConfirm"))) return;
    try {
      await deleteTopic(topicId);
      router.push("/");
    } catch {}
  };

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-2xl mx-auto px-5 py-10">
          <div className="space-y-4">
            <div className="h-6 w-24 bg-muted/50 rounded animate-pulse" />
            <div className="h-8 w-3/4 bg-muted/50 rounded animate-pulse" />
            <div className="h-40 bg-muted/50 rounded-2xl animate-pulse" />
          </div>
        </main>
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-2xl mx-auto px-5 py-20 text-center">
          <RefreshCw className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">加载失败，请刷新重试</p>
          <button
            onClick={fetchTopic}
            className="mt-3 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors"
          >重试</button>
        </main>
      </div>
    );
  }

  if (!topic) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-2xl mx-auto px-5 py-20 text-center">
          <p className="text-muted-foreground">{t("topic.notFound")}</p>
          <Link href="/" className="text-sm text-primary hover:underline mt-2 inline-block">
            {t("topic.backCommunity")}
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-5 py-10">
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8">
          <ArrowLeft className="h-3.5 w-3.5" /> {t("topic.back")}
        </Link>

        <article>
          {editing ? (
            <div className="space-y-3 mb-6">
              <input type="text" value={editTitle} onChange={(e) => setEditTitle(e.target.value)}
                className="w-full h-10 px-3 rounded-lg border bg-background text-foreground text-lg font-serif font-medium" />
              <textarea value={editContent} onChange={(e) => setEditContent(e.target.value)} rows={12}
                className="w-full px-3 py-2 rounded-lg border bg-background text-foreground text-sm font-mono resize-y" />
              <div className="flex gap-2">
                <button onClick={() => setEditing(false)} className="h-9 px-4 rounded-lg border text-sm hover:bg-muted">
                  {t("topic.editCancel")}
                </button>
                <button onClick={handleEdit} className="h-9 px-4 rounded-lg bg-primary text-primary-foreground text-sm">
                  {t("topic.editSave")}
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl font-normal font-serif tracking-tight leading-snug">{topic.title}</h1>
              <div className="flex items-center gap-3 mt-4 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                    {getInitials(topic.author_name)}
                  </div>
                  <span className="font-medium text-foreground">{topic.author_name}</span>
                </div>
                <span>·</span>
                <span>{formatDate(topic.created_at)}</span>
                {topic.section_name && (
                  <>
                    <span>·</span>
                    <span className="text-amber-600 dark:text-amber-400">{topic.section_name}</span>
                  </>
                )}
              </div>
              <div className="mt-8 text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap prose prose-sm max-w-none dark:prose-invert [&_blockquote]:text-[10px] [&_blockquote]:text-gray-400 [&_blockquote]:border-0 [&_blockquote]:italic [&_blockquote]:mt-6">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{topic.content}</ReactMarkdown>
              </div>
            </>
          )}

          <div className="flex flex-wrap gap-2 mt-8">
            {topic.tags && topic.tags.map((tag) => (
              <span key={tag} className="px-2.5 py-0.5 rounded-md text-[11px] bg-accent/60 text-accent-foreground">{tag}</span>
            ))}
          </div>

          <div className="flex items-center gap-3 py-4 mt-6 border-t border-b border-border/60">
            <button onClick={handleLike} disabled={!user}
              className={`inline-flex items-center gap-1.5 text-sm transition-colors ${topic.liked ? "text-red-500" : "text-muted-foreground hover:text-red-400"} disabled:opacity-50`}>
              <Heart className={`h-4 w-4 ${topic.liked ? "fill-current" : ""}`} /> {topic.likes_count || 0}
            </button>

            <div className="relative">
              <button onClick={() => setShowEmoji(showEmoji === "post" ? "" : "post")}
                className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
                <Smile className="h-4 w-4" />
              </button>
              {showEmoji === "post" && (
                <div className="absolute top-full mt-2 left-0 bg-card border border-border rounded-xl p-2 shadow-xl z-50 flex gap-1 flex-wrap w-56">
                  {EMOJI_LIST.map((emoji) => (
                    <button key={emoji} onClick={() => handleReaction("post", topic.id, emoji)}
                      className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted text-lg transition-colors">{emoji}</button>
                  ))}
                </div>
              )}
            </div>

            {topic.reactions && topic.reactions.length > 0 && (
              <div className="flex items-center gap-1">
                {topic.reactions.map((r) => (
                  <button key={r.emoji} onClick={() => handleReaction("post", topic.id, r.emoji)}
                    className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs transition-colors ${
                      (topic.my_reactions || []).includes(r.emoji) ? "bg-primary/10 text-primary border border-primary/30" : "bg-muted hover:bg-muted/80"
                    }`}>{r.emoji} <span className="text-muted-foreground">{r.count}</span></button>
                ))}
              </div>
            )}

            <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground ml-auto">
              <MessageSquare className="h-4 w-4" /> {topic.comments_count || 0}
            </span>

            {user && user.id === topic.author_id && !editing && (
              <>
                <button onClick={handleEdit} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
                  <Edit3 className="h-4 w-4" />
                </button>
                <button onClick={handleDelete} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 text-muted-foreground hover:text-red-500 transition-colors">
                  <Trash2 className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </article>

        <section className="mt-12">
          <h2 className="text-base font-medium font-serif mb-8">
            {t("topic.commentsCount", { count: comments.length })}
          </h2>

          {comments.length > 0 ? (
            <>
              <div className="space-y-0">
                {(commentsExpanded ? comments : comments.slice(0, 3)).map((comment) => (
                  <CommentItem key={comment.id} comment={comment} depth={0} user={user}
                    onReply={(id, name) => {
                      setReplyTo({ id, name });
                      const ta = document.querySelector("textarea");
                      ta?.scrollIntoView({ behavior: "smooth", block: "center" });
                      setTimeout(() => ta?.focus(), 300);
                    }}
                    showEmoji={showCommentEmoji} setShowEmoji={setShowCommentEmoji} onReaction={handleReaction} />
                ))}
              </div>
              {comments.length > 3 && !commentsExpanded && (
                <button onClick={() => setCommentsExpanded(true)}
                  className="mt-3 text-sm text-primary hover:text-primary/80 transition-colors font-medium">
                  {t("topic.expandReplies", { count: comments.length - 3 })}
                </button>
              )}
              {commentsExpanded && comments.length > 3 && (
                <button onClick={() => setCommentsExpanded(false)}
                  className="mt-3 text-sm text-muted-foreground hover:text-foreground transition-colors">
                  {t("topic.collapse")}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground py-6">{t("topic.noComments")}</p>
          )}

          {user ? (
            <form onSubmit={handleComment} className="mt-8 space-y-3">
              {replyTo && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t("topic.replyTo", { name: replyTo.name })}</span>
                  <button type="button" onClick={() => setReplyTo(null)}
                    className="text-xs text-muted-foreground hover:text-foreground">{t("topic.editCancel")}</button>
                </div>
              )}
              <textarea
                placeholder={replyTo ? t("topic.replyPlaceholder", { name: replyTo.name }) : t("topic.commentPlaceholder")}
                value={commentText} onChange={(e) => setCommentText(e.target.value)} required rows={5}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm resize-y placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all min-h-[120px]" />
              <div className="flex justify-end">
                <button type="submit" disabled={commenting || !commentText.trim()}
                  className="h-9 px-5 rounded-lg bg-primary text-primary-foreground text-[13px] font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors">
                  {commenting ? t("topic.sending") : replyTo ? t("topic.replyBtn") : t("topic.commentBtn")}
                </button>
              </div>
            </form>
          ) : (
            <p className="mt-8 text-sm text-muted-foreground">
              <Link href="/login" className="text-primary hover:underline">{t("header.signIn")}</Link>{" "}
              {t("topic.signInPrompt")}
            </p>
          )}
        </section>
      </main>
    </div>
  );
}

function CommentItem({
  comment, depth, user, onReply, showEmoji, setShowEmoji, onReaction,
}: {
  comment: CommentItem;
  depth: number;
  user: any;
  onReply: (id: string, name: string) => void;
  showEmoji: string;
  setShowEmoji: (id: string) => void;
  onReaction: (targetType: "post" | "comment", targetId: string, emoji: string) => void;
}) {
  const { t } = useTranslation();
  const isReply = depth > 0;

  return (
    <div className={isReply ? "ml-6 pl-4 border-l-2 border-border/60" : ""}>
      <div className="py-4">
        <div className="flex gap-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-medium text-primary mt-0.5">
            {getInitials(comment.author_name)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
              <span className="text-sm font-medium text-foreground">{comment.author_name}</span>
              {comment.author_location && (
                <>
                  <span className="text-muted-foreground/40 text-xs">·</span>
                  <span className="text-xs text-muted-foreground">{comment.author_location}</span>
                </>
              )}
              <span className="text-muted-foreground/40 text-xs">·</span>
              <span className="text-xs text-muted-foreground">{formatTime(comment.created_at, t)}</span>
            </div>
            <p className="text-sm leading-relaxed text-foreground/85 whitespace-pre-wrap break-words">{comment.content}</p>
            <div className="flex items-center gap-3 mt-2">
              {user && (
                <button onClick={() => onReply(comment.id, comment.author_name)}
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                  <CornerDownRight className="h-3 w-3" /> {t("topic.replyBtn")}
                </button>
              )}
              <div className="relative">
                <button onClick={() => setShowEmoji(showEmoji === comment.id ? "" : comment.id)}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <Smile className="h-3.5 w-3.5" />
                </button>
                {showEmoji === comment.id && (
                  <div className="absolute top-full mt-2 left-0 bg-card border border-border rounded-xl p-2 shadow-xl z-50 flex gap-1 flex-wrap w-48">
                    {EMOJI_LIST.slice(0, 8).map((emoji) => (
                      <button key={emoji} onClick={() => onReaction("comment", comment.id, emoji)}
                        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-muted text-base transition-colors">{emoji}</button>
                    ))}
                  </div>
                )}
              </div>
              {comment.reactions && comment.reactions.length > 0 && (
                <div className="flex items-center gap-1">
                  {comment.reactions.map((r) => (
                    <button key={r.emoji} onClick={() => onReaction("comment", comment.id, r.emoji)}
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[11px] transition-colors ${
                        (comment.my_reactions || []).includes(r.emoji) ? "bg-primary/10 text-primary border border-primary/30" : "bg-muted hover:bg-muted/80"
                      }`}>{r.emoji} <span className="text-muted-foreground">{r.count}</span></button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="pb-2">
          {comment.replies.map((reply) => (
            <CommentItem key={reply.id} comment={reply} depth={depth + 1} user={user}
              onReply={onReply} showEmoji={showEmoji} setShowEmoji={setShowEmoji} onReaction={onReaction} />
          ))}
        </div>
      )}
    </div>
  );
}
