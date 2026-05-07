import { useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { settingsApi } from "@/lib/api";
import { useAppStore } from "@/stores/appStore";
import { Moon, Sun, Monitor, FolderOpen, Server, Info, Link, Download, Save, CheckCircle, ImagePlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const THEMES = [
  { value: "light", labelKey: "light-mode", icon: Sun },
  { value: "dark", labelKey: "dark-mode", icon: Moon },
  { value: "system", labelKey: "system-mode", icon: Monitor },
];

const LOCALES = [
  { value: "zh-CN", labelKey: "locale.zh-CN" },
  { value: "en", labelKey: "locale.en" },
];

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg p-5">
      <div className="mb-3"><h3 className="font-medium text-sm">{title}</h3>{description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}</div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

export default function SettingsPage() {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const { setLocale, setTheme, userName, userAvatarUrl, setUserProfile, locale, theme } = useAppStore();
  const [saved, setSaved] = useState(false);
  const [avatarError, setAvatarError] = useState("");
  const [workspaceTapCount, setWorkspaceTapCount] = useState(0);
  const [showBackendApi, setShowBackendApi] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement>(null);

  const { data: settings = {} } = useQuery({ queryKey: ["settings"], queryFn: () => settingsApi.get().then((r) => r.data) });
  const { data: runtimeInfo = {} } = useQuery({ queryKey: ["settings-runtime"], queryFn: () => settingsApi.getRuntime().then((r) => r.data) });
  const { data: envInfo = [] } = useQuery({ queryKey: ["settings-environment"], queryFn: () => settingsApi.getEnvironment().then((r) => r.data) });

  const s = settings as any;
  const [form, setForm] = useState<Record<string, any>>({});
  const merged = { theme, locale, user_name: userName, user_avatar_url: userAvatarUrl, ...s, ...form };
  const resolvedUserName = String(merged.user_name || "").trim() || t("chat.user.default-name");
  const resolvedAvatarUrl = String(merged.user_avatar_url || "").trim();
  const userAvatarLabel = resolvedUserName.slice(0, 1).toUpperCase();
  const runtime = runtimeInfo as any;
  const envMap = useMemo(() => { const map: Record<string, string> = {}; for (const item of envInfo as any[]) { if (item?.key && item?.value_preview) map[item.key] = item.value_preview; } return map; }, [envInfo]);

  const workspaceDataDir = envMap.APP_DATA_DIR || runtime.data_dir || "~/.sven";
  const modelCacheDir = envMap.MODEL_CACHE_DIR || `${workspaceDataDir}/model_cache`;

  const updateMut = useMutation({
    mutationFn: (data: any) => settingsApi.update(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings"] }); setSaved(true); setTimeout(() => setSaved(false), 2000); },
  });

  const handleSave = () => {
    if (merged.theme === "light" || merged.theme === "dark" || merged.theme === "system") setTheme(merged.theme);
    if (merged.locale === "zh-CN" || merged.locale === "en") { setLocale(merged.locale); void i18n.changeLanguage(merged.locale); }
    setUserProfile({ name: resolvedUserName, avatarUrl: resolvedAvatarUrl });
    updateMut.mutate(merged);
  };
  const set = (key: string, val: any) => setForm((f) => ({ ...f, [key]: val }));

  const openAvatarPicker = () => { setAvatarError(""); avatarFileInputRef.current?.click(); };
  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; if (!file) return;
    if (!file.type.startsWith("image/")) { setAvatarError(t("settings.profile.avatar-invalid-type")); event.currentTarget.value = ""; return; }
    if (file.size > 2 * 1024 * 1024) { setAvatarError(t("settings.profile.avatar-too-large")); event.currentTarget.value = ""; return; }
    const reader = new FileReader();
    reader.onload = () => { const result = typeof reader.result === "string" ? reader.result : ""; if (!result) { setAvatarError(t("settings.profile.avatar-read-failed")); return; } set("user_avatar_url", result); setAvatarError(""); };
    reader.onerror = () => { setAvatarError(t("settings.profile.avatar-read-failed")); };
    reader.readAsDataURL(file);
    event.currentTarget.value = "";
  };
  const clearAvatar = () => { set("user_avatar_url", ""); setAvatarError(""); };

  const handleWorkspaceTabClick = () => {
    if (showBackendApi) return;
    setWorkspaceTapCount((c) => { const next = c + 1; if (next >= 3) { setShowBackendApi(true); return 0; } return next; });
  };

  const APP_VERSION = "0.1.0";
  const BUILD_DATE = "2025-04";

  return (
    <div className="pt-4 px-6 pb-6 space-y-5">
      <div className="flex justify-end mb-4">
        <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
          {saved ? <><CheckCircle className="w-3.5 h-3.5 mr-1 text-emerald-400" />{t("settings.saved")}</> : <><Save className="w-3.5 h-3.5 mr-1" />{t("settings.save-settings")}</>}
        </Button>
      </div>

      <Tabs defaultValue="appearance">
        <TabsList className="mb-4">
          <TabsTrigger value="appearance" onClick={() => setWorkspaceTapCount(0)} className="text-xs">{t("settings.tabs.appearance")}</TabsTrigger>
          <TabsTrigger value="workspace" onClick={handleWorkspaceTabClick} className="text-xs">{t("settings.tabs.workspace")}</TabsTrigger>
          <TabsTrigger value="about" onClick={() => setWorkspaceTapCount(0)} className="text-xs">{t("settings.tabs.about")}</TabsTrigger>
        </TabsList>

        <TabsContent value="appearance" className="space-y-3">
          <Section title={t("settings.section.profile.title")} description={t("settings.section.profile.description")}>
            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 p-3">
              <Avatar className="h-10 w-10 rounded-lg"><AvatarImage src={resolvedAvatarUrl} alt={resolvedUserName} /><AvatarFallback className="rounded-lg bg-muted">{userAvatarLabel}</AvatarFallback></Avatar>
              <div className="min-w-0"><p className="truncate text-sm font-medium">{resolvedUserName}</p><p className="text-xs text-muted-foreground">{t("settings.profile.avatar-preview")}</p></div>
            </div>
            <div className="space-y-1.5"><label className="text-sm font-medium">{t("settings.profile.username")}</label><Input value={merged.user_name || ""} onChange={(e) => set("user_name", e.target.value)} placeholder={t("settings.profile.username-placeholder")} /></div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t("settings.profile.avatar")}</label>
              <input ref={avatarFileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarFileChange} />
              <div className="flex flex-wrap items-center gap-1.5">
                <Button type="button" variant="outline" size="sm" onClick={openAvatarPicker}><ImagePlus className="mr-1 h-3.5 w-3.5" />{t("settings.profile.avatar-upload")}</Button>
                <Button type="button" variant="ghost" size="sm" onClick={clearAvatar} disabled={!resolvedAvatarUrl}><X className="mr-1 h-3.5 w-3.5" />{t("settings.profile.avatar-clear")}</Button>
              </div>
              {avatarError && <p className="text-xs text-destructive">{avatarError}</p>}
            </div>
          </Section>

          <Section title={t("settings.section.theme.title")} description={t("settings.section.theme.description")}>
            <div className="grid grid-cols-3 gap-2">
              {THEMES.map(({ value, labelKey, icon: Icon }) => (
                <Button key={value} onClick={() => set("theme", value)} variant={merged.theme === value ? "default" : "outline"} className="h-auto py-2.5 flex flex-col items-center gap-1.5"><Icon className="w-4 h-4" /><span className="text-xs">{t(labelKey)}</span></Button>
              ))}
            </div>
          </Section>

          <Section title={t("settings.section.language.title")} description={t("settings.section.language.description")}>
            <div className="flex gap-2">
              {LOCALES.map(({ value, labelKey }) => <Button key={value} onClick={() => set("locale", value)} variant={merged.locale === value ? "default" : "outline"} size="sm">{t(labelKey)}</Button>)}
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="workspace" className="space-y-3">
          {showBackendApi && (
            <Section title={t("settings.section.backend.title")} description={t("settings.section.backend.description")}>
              <div className="space-y-1.5"><label className="text-sm font-medium">{t("settings.backend.url")}</label><Input value={merged.backend_url || "http://localhost:8000"} onChange={(e) => set("backend_url", e.target.value)} /></div>
              <div className="flex items-center justify-between"><div><p className="text-sm">{t("settings.backend.auto-reconnect")}</p><p className="text-xs text-muted-foreground">{t("settings.backend.auto-reconnect-hint")}</p></div><Switch checked={merged.auto_reconnect ?? true} onCheckedChange={(v) => set("auto_reconnect", v)} /></div>
            </Section>
          )}
          <Section title={t("settings.section.workspace.title")} description={t("settings.section.workspace.description")}>
            <div className="space-y-1.5"><label className="text-sm font-medium">{t("settings.workspace.data-dir")}</label><div className="flex gap-1.5"><Input value={workspaceDataDir} readOnly /><Tooltip><TooltipTrigger asChild><Button variant="outline" size="icon" disabled><FolderOpen className="w-3.5 h-3.5" /></Button></TooltipTrigger><TooltipContent>Browse data directory</TooltipContent></Tooltip></div></div>
            <div className="space-y-1.5"><label className="text-sm font-medium">{t("settings.workspace.model-cache-dir")}</label><Input value={modelCacheDir} readOnly /></div>
            <div className="flex items-center justify-between"><div><p className="text-sm">{t("settings.workspace.auto-backup")}</p><p className="text-xs text-muted-foreground">{t("settings.workspace.auto-backup-hint")}</p></div><Switch checked={merged.auto_backup ?? false} onCheckedChange={(v) => set("auto_backup", v)} /></div>
          </Section>
          <Section title={t("settings.section.data.title")}>
            <div className="flex gap-2"><Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1" />{t("settings.data.export-config")}</Button><Button variant="outline" size="sm"><Download className="w-3.5 h-3.5 mr-1" />{t("settings.data.export-data")}</Button></div>
          </Section>
        </TabsContent>

        <TabsContent value="about" className="space-y-3">
          <Section title={t("settings.section.about.title")}>
            <div className="space-y-2">
              {[
                [t("settings.about.version"), <Badge variant="outline" className="font-mono">{APP_VERSION}</Badge>],
                [t("settings.about.build-date"), <span className="text-sm">{BUILD_DATE}</span>],
                [t("settings.about.license"), <span className="text-sm">MIT</span>],
              ].map(([label, value], i) => (
                <div key={i} className="flex items-center justify-between py-1.5 border-b border-border last:border-0"><span className="text-sm text-muted-foreground">{label}</span>{value}</div>
              ))}
            </div>
          </Section>
          <Section title={t("settings.section.links.title")}>
            <div className="space-y-1.5">
              {[
                { label: t("settings.links.github"), url: "https://github.com/your-org/sven", icon: Link },
                { label: t("settings.links.docs"), url: "https://docs.sven.ai", icon: Info },
                { label: t("settings.links.issues"), url: "https://github.com/your-org/sven/issues", icon: Server },
              ].map(({ label, url, icon: Icon }) => (
                <a key={label} href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 text-sm text-primary hover:underline"><Icon className="w-3.5 h-3.5" />{label}</a>
              ))}
            </div>
          </Section>
        </TabsContent>
      </Tabs>
    </div>
  );
}
