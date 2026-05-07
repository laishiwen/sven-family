import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Save, Settings as SettingsIcon, Loader2, Globe, Mail, Lock, Eye, EyeOff } from "lucide-react";

interface SiteSettings {
  site_name?: string;
  registration_enabled?: boolean;
  post_review_enabled?: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_from_address?: string;
}

export default function Settings() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SiteSettings>({});
  const [showPassword, setShowPassword] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const { data, isLoading, isError } = useQuery<SiteSettings>({
    queryKey: ["settings"],
    queryFn: async () => {
      const res = await settingsApi.get();
      return res.data;
    },
  });

  useEffect(() => {
    if (data && !loaded) {
      setForm({
        site_name: data.site_name || "",
        registration_enabled: data.registration_enabled ?? true,
        post_review_enabled: data.post_review_enabled ?? false,
        smtp_host: data.smtp_host || "",
        smtp_port: data.smtp_port || 587,
        smtp_username: data.smtp_username || "",
        smtp_password: data.smtp_password || "",
        smtp_from_address: data.smtp_from_address || "",
      });
      setLoaded(true);
    }
  }, [data, loaded]);

  const updateMutation = useMutation({
    mutationFn: (data: SiteSettings) => settingsApi.update(data),
    onSuccess: () => {
      toast(t("settings.saved"), { variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: (err: any) => toast(err?.response?.data?.detail || t("settings.save") + " failed", { variant: "destructive" }),
  });

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  const hasChanges =
    loaded &&
    JSON.stringify(form) !==
      JSON.stringify({
        site_name: data?.site_name || "",
        registration_enabled: data?.registration_enabled ?? true,
        post_review_enabled: data?.post_review_enabled ?? false,
        smtp_host: data?.smtp_host || "",
        smtp_port: data?.smtp_port || 587,
        smtp_username: data?.smtp_username || "",
        smtp_password: data?.smtp_password || "",
        smtp_from_address: data?.smtp_from_address || "",
      });

  if (isError) {
    toast(t("settings.load-failed"), { variant: "destructive" });
  }

  return (
    <div className="space-y-6">
      {/* Header with Save */}
      <div className="flex items-center justify-end">
        <Button
          onClick={handleSave}
          disabled={updateMutation.isPending || !hasChanges}
        >
          <Save className="w-4 h-4 mr-1" />
          {updateMutation.isPending ? t("settings.saving") : t("settings.save-changes")}
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="h-5 bg-muted animate-pulse rounded w-1/4" />
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6 space-y-4">
              <div className="h-5 bg-muted animate-pulse rounded w-1/4" />
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
              <div className="h-10 bg-muted animate-pulse rounded" />
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* Site Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <Globe className="w-4 h-4 text-primary" />
                {t("settings.site")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="site-name">{t("settings.site-name")}</Label>
                <Input
                  id="site-name"
                  value={form.site_name || ""}
                  onChange={(e) => setForm((f) => ({ ...f, site_name: e.target.value }))}
                  placeholder={t("settings.site-name-placeholder")}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">{t("settings.registration")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.registration-desc")}
                  </p>
                </div>
                <Switch
                  checked={form.registration_enabled ?? true}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, registration_enabled: v }))}
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div>
                  <p className="text-sm font-medium">{t("settings.review")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("settings.review-desc")}
                  </p>
                </div>
                <Switch
                  checked={form.post_review_enabled ?? false}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, post_review_enabled: v }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Email Settings */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <Mail className="w-4 h-4 text-primary" />
                {t("settings.email-title")}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="smtp-host">{t("settings.smtp-host")}</Label>
                  <Input
                    id="smtp-host"
                    value={form.smtp_host || ""}
                    onChange={(e) => setForm((f) => ({ ...f, smtp_host: e.target.value }))}
                    placeholder={t("settings.smtp-host-placeholder")}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-port">{t("settings.smtp-port")}</Label>
                  <Input
                    id="smtp-port"
                    type="number"
                    value={form.smtp_port || 587}
                    onChange={(e) => setForm((f) => ({ ...f, smtp_port: parseInt(e.target.value) || 587 }))}
                    placeholder="587"
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-username">{t("settings.smtp-user")}</Label>
                  <Input
                    id="smtp-username"
                    value={form.smtp_username || ""}
                    onChange={(e) => setForm((f) => ({ ...f, smtp_username: e.target.value }))}
                    placeholder={t("settings.smtp-user-placeholder")}
                  />
                </div>
                <div>
                  <Label htmlFor="smtp-password">{t("settings.smtp-pass")}</Label>
                  <div className="relative">
                    <Input
                      id="smtp-password"
                      type={showPassword ? "text" : "password"}
                      value={form.smtp_password || ""}
                      onChange={(e) => setForm((f) => ({ ...f, smtp_password: e.target.value }))}
                      placeholder={t("settings.smtp-pass-placeholder")}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>
              <div>
                <Label htmlFor="smtp-from">{t("settings.from-address")}</Label>
                <Input
                  id="smtp-from"
                  type="email"
                  value={form.smtp_from_address || ""}
                  onChange={(e) => setForm((f) => ({ ...f, smtp_from_address: e.target.value }))}
                  placeholder={t("settings.from-address-placeholder")}
                />
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
