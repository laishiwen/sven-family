"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth-context";
import { Header } from "@/components/header";
import { getSections, createTopic } from "@/lib/bridge-client";
import { Plus } from "lucide-react";

interface Section {
  id: string;
  name: string;
  slug: string;
}

export default function NewTopicPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [sectionId, setSectionId] = useState("sec-engineering");
  const [tagsInput, setTagsInput] = useState("");
  const [sections, setSections] = useState<Section[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getSections()
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setSections(data);
          setSectionId(data[0].id);
        }
      })
      .catch(() => {});
  }, []);

  if (!user) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="max-w-2xl mx-auto px-4 py-16 text-center text-muted-foreground">
          <p className="text-sm">{t("newTopic.loginRequired")}</p>
        </main>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!title.trim() || !content.trim()) {
      setError(t("newTopic.errorEmpty"));
      return;
    }

    const tags = tagsInput
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);

    setLoading(true);
    try {
      const data = await createTopic({ title, content, section_id: sectionId, tags });
      router.push(`/topics/${data.id}`);
    } catch (err: any) {
      setError(err.message || t("newTopic.errorNetwork"));
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-2xl mx-auto px-4 py-10">
        <h2 className="text-xl font-serif font-medium mb-6">{t("newTopic.pageTitle")}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Section selector */}
          <div>
            <label className="text-sm font-medium mb-1.5 block text-muted-foreground">{t("newTopic.section")}</label>
            <div className="flex flex-wrap gap-2">
              {sections.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setSectionId(s.id)}
                  className={`px-3 py-1.5 rounded-full text-[13px] font-medium transition-colors ${
                    sectionId === s.id
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block text-muted-foreground">{t("newTopic.titleLabel")}</label>
            <input
              type="text"
              placeholder={t("newTopic.titlePlaceholder")}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block text-muted-foreground">{t("newTopic.contentLabel")}</label>
            <textarea
              placeholder={t("newTopic.contentPlaceholder")}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              required
              rows={14}
              className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-sm font-mono resize-y placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1.5 block text-muted-foreground">{t("newTopic.tagsLabel")}</label>
            <input
              type="text"
              placeholder={t("newTopic.tagsPlaceholder")}
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-foreground text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 transition-all"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="h-10 px-5 rounded-lg border border-border text-sm hover:bg-muted transition-colors"
            >
              {t("topic.editCancel")}
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-1.5 h-10 px-6 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Plus className="h-4 w-4" /> {loading ? t("newTopic.publishing") : t("newTopic.publish")}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
