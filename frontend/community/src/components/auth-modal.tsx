"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "./auth-context";
import { Loader2 } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { t } = useTranslation();
  const { login, register } = useAuth();
  const [tab, setTab] = useState<"login" | "register">("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const reset = () => {
    setError("");
    setEmail("");
    setUsername("");
    setPassword("");
    setLoading(false);
  };

  const handleClose = () => {
    reset();
    setTab("login");
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password.trim()) {
      setError(t("auth.errorRequired"));
      return;
    }

    setLoading(true);
    try {
      let result;
      if (tab === "login") {
        result = await login(email.trim(), password.trim());
      } else {
        if (!username.trim()) {
          setError(t("auth.errorRequired"));
          setLoading(false);
          return;
        }
        result = await register(email.trim(), username.trim(), password.trim());
      }

      if (result?.error) {
        setError(result.error);
      } else {
        handleClose();
      }
    } catch {
      setError(t("auth.errorGeneric"));
    } finally {
      setLoading(false);
    }
  };

  // Lock body scroll when modal is open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "";
      };
    }
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-sm mx-4 bg-[var(--card)] rounded-2xl border border-[var(--border)] shadow-elevated p-6">
        {/* Tabs */}
        <div className="flex rounded-lg bg-muted p-0.5 mb-6">
          <button
            onClick={() => {
              setTab("login");
              setError("");
            }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              tab === "login"
                ? "bg-[var(--card)] text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("auth.signIn")}
          </button>
          <button
            onClick={() => {
              setTab("register");
              setError("");
            }}
            className={`flex-1 py-2 rounded-md text-sm font-medium transition-all ${
              tab === "register"
                ? "bg-[var(--card)] text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.04)]"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t("auth.register")}
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {tab === "register" && (
            <div>
              <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                {t("auth.username")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t("auth.usernamePlaceholder")}
                className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all"
                autoFocus
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t("auth.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all"
              autoFocus={tab === "login"}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1.5">
              {t("auth.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="········"
              className="w-full h-10 px-3 rounded-lg border border-border bg-background text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:border-amber-500/60 focus:shadow-[0_0_0_3px_rgba(217,119,6,0.10)] transition-all"
            />
          </div>

          {error && (
            <p className="text-xs text-red-500 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            {loading && <Loader2 className="w-4 h-4 animate-spin" />}
            {tab === "login" ? t("auth.signIn") : t("auth.createAccount")}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          {tab === "login" ? (
            <>
              {t("auth.noAccount")}{" "}
              <button
                onClick={() => {
                  setTab("register");
                  setError("");
                }}
                className="text-primary hover:underline font-medium"
              >
                {t("auth.register")}
              </button>
            </>
          ) : (
            <>
              {t("auth.hasAccount")}{" "}
              <button
                onClick={() => {
                  setTab("login");
                  setError("");
                }}
                className="text-primary hover:underline font-medium"
              >
                {t("auth.signIn")}
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
