"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/components/auth-context";
import { Header } from "@/components/header";
import { LogIn } from "lucide-react";

export default function LoginPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const result = await login(email, password);
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
          <LogIn className="h-8 w-8 mx-auto mb-2 text-primary" />
          <h2 className="text-lg font-semibold">{t("login.title")}</h2>
          <p className="text-xs text-muted-foreground">
            {t("login.subtitle")}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="p-2 rounded-md bg-red-50 dark:bg-red-950 text-red-600 dark:text-red-400 text-xs">
              {error}
            </div>
          )}
          <input
            type="email"
            placeholder={t("login.emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full h-9 px-3 rounded-md border bg-background text-sm"
          />
          <input
            type="password"
            placeholder={t("login.passwordPlaceholder")}
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
            {loading ? t("login.loggingIn") : t("login.title")}
          </button>
        </form>
        <p className="text-center text-xs text-muted-foreground mt-4">
          {t("login.noAccount")}{" "}
          <Link href="/register" className="text-primary hover:underline">
            {t("auth.register")}
          </Link>
        </p>
      </main>
    </div>
  );
}
