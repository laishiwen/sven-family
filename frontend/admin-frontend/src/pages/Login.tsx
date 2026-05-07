import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "@/stores/authStore";
import { authApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { t } = useTranslation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!email || !password) {
      setError(t("login.error-required"));
      return;
    }

    setLoading(true);
    try {
      // SHA-256 hash password before sending — never transmit plaintext
      const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(password));
      const hashedPassword = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, "0")).join("");
      const res = await authApi.login(email, hashedPassword);
      const { access_token, admin } = res.data;
      login(access_token, { id: admin.id, email: admin.email, name: admin.username || admin.email, role: admin.role });
      navigate("/dashboard");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(detail || err.message || t("login.error-failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-3">
            <div className="w-4 h-4 rounded-full bg-primary" />
          </div>
          <CardTitle className="font-serif text-2xl">{t("login.title")}</CardTitle>
          <CardDescription>{t("login.description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}
            <div className="space-y-2">
              <label
                htmlFor="email"
                className="text-sm font-medium leading-none"
              >
                {t("login.email")}
              </label>
              <Input
                id="email"
                type="email"
                placeholder={t("login.email-placeholder")}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="space-y-2">
              <label
                htmlFor="password"
                className="text-sm font-medium leading-none"
              >
                {t("login.password")}
              </label>
              <Input
                id="password"
                type="password"
                placeholder={t("login.password-placeholder")}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading}
            >
              {loading ? t("login.signing-in") : t("login.sign-in")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
