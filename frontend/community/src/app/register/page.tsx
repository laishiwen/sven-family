"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth-context";
import { Header } from "@/components/header";
import { UserPlus } from "lucide-react";

export default function RegisterPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { register } = useAuth();
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError(t("register.passwordMin"));
      return;
    }
    setLoading(true);
    const result = await register(email, username, password);
    setLoading(false);
    if (result.error) {
      setError(result.error);
    } else {
      router.push("/");
    }
  };

  return (
    <div className="min-h-screen">
      <Header />
      <main className="max-w-sm mx-auto px-4 py-16">
        <div className="text-center mb-6">
          <UserPlus className="h-8 w-8 mx-auto mb-2 text-primary" />
          <h2 className="text-lg font-semibold">{t("register.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("register.subtitle")}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="p-2 rounded-md bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}
          <input
            type="text"
            placeholder={t("register.usernamePlaceholder")}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            className="w-full h-9 px-3 rounded-md border bg-background text-sm"
          />
          <input
            type="email"
            placeholder={t("register.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-9 px-3 rounded-md border bg-background text-sm"
          />
          <input
            type="password"
            placeholder={t("register.passwordPlaceholder")}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full h-9 px-3 rounded-md border bg-background text-sm"
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? t("register.creating") : t("register.title")}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          {t("register.hasAccount")}{" "}
          <Link href="/login" className="text-primary hover:underline">
            {t("login.title")}
          </Link>
        </p>
      </main>
    </div>
  );
}
