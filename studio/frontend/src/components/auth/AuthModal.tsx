import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAppStore } from "@/stores/appStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
}

export function AuthModal({ open, onClose }: AuthModalProps) {
  const { t } = useTranslation();
  const login = useAppStore((s) => s.login);
  const [tab, setTab] = useState("login");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Login form
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Register form
  const [regName, setRegName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regConfirm, setRegConfirm] = useState("");

  const reset = () => {
    setError("");
    setLoginEmail("");
    setLoginPassword("");
    setRegName("");
    setRegEmail("");
    setRegPassword("");
    setRegConfirm("");
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleLogin = async () => {
    setError("");
    if (!loginEmail.trim() || !loginPassword.trim()) return;
    setLoading(true);
    try {
      // TODO: replace with real auth API call
      const token = "mock-token-" + Date.now();
      login({ email: loginEmail.trim(), name: loginEmail.trim() }, token);
      handleClose();
    } catch {
      setError(t("auth.login-failed"));
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    setError("");
    if (!regName.trim() || !regEmail.trim() || !regPassword.trim()) return;
    if (regPassword !== regConfirm) {
      setError(t("auth.password-mismatch"));
      return;
    }
    setLoading(true);
    try {
      // TODO: replace with real auth API call
      const token = "mock-token-" + Date.now();
      login({ email: regEmail.trim(), name: regName.trim() }, token);
      handleClose();
    } catch {
      setError(t("auth.register-failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center text-lg">
            {tab === "login" ? t("auth.login-tab") : t("auth.register-tab")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {tab === "login"
              ? t("auth.login-description")
              : t("auth.register-description")}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => { setTab(v); setError(""); }}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">{t("auth.login-tab")}</TabsTrigger>
            <TabsTrigger value="register">{t("auth.register-tab")}</TabsTrigger>
          </TabsList>

          <TabsContent value="login" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">{t("auth.email")}</Label>
              <Input
                id="login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder={t("auth.email-placeholder")}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">{t("auth.password")}</Label>
              <Input
                id="login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder={t("auth.password-placeholder")}
                onKeyDown={(e) => e.key === "Enter" && handleLogin()}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleLogin}
              disabled={loading || !loginEmail.trim() || !loginPassword.trim()}
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("auth.login-button")}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {t("auth.no-account")}{" "}
              <button
                onClick={() => setTab("register")}
                className="text-primary hover:underline font-medium"
              >
                {t("auth.go-register")}
              </button>
            </p>
          </TabsContent>

          <TabsContent value="register" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label htmlFor="reg-name">{t("auth.username")}</Label>
              <Input
                id="reg-name"
                value={regName}
                onChange={(e) => setRegName(e.target.value)}
                placeholder={t("auth.username-placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-email">{t("auth.email")}</Label>
              <Input
                id="reg-email"
                type="email"
                value={regEmail}
                onChange={(e) => setRegEmail(e.target.value)}
                placeholder={t("auth.email-placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-password">{t("auth.password")}</Label>
              <Input
                id="reg-password"
                type="password"
                value={regPassword}
                onChange={(e) => setRegPassword(e.target.value)}
                placeholder={t("auth.password-placeholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reg-confirm">{t("auth.confirm-password")}</Label>
              <Input
                id="reg-confirm"
                type="password"
                value={regConfirm}
                onChange={(e) => setRegConfirm(e.target.value)}
                placeholder={t("auth.confirm-password-placeholder")}
                onKeyDown={(e) => e.key === "Enter" && handleRegister()}
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <Button
              className="w-full"
              onClick={handleRegister}
              disabled={
                loading ||
                !regName.trim() ||
                !regEmail.trim() ||
                !regPassword.trim() ||
                !regConfirm.trim()
              }
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {t("auth.register-button")}
            </Button>

            <p className="text-center text-xs text-muted-foreground">
              {t("auth.has-account")}{" "}
              <button
                onClick={() => setTab("login")}
                className="text-primary hover:underline font-medium"
              >
                {t("auth.go-login")}
              </button>
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
