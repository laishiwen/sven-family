import { useState, useRef, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { skillsApi } from "@/lib/api";
import { pickDirectory } from "@/lib/electron";
import { useToastStore } from "@/stores/toastStore";
import {
  Zap,
  Trash2,
  Pencil,
  Download,
  Search,
  Wrench,
  Globe,
  Loader2,
  CheckCircle,
  RefreshCw,
  Eye,
  Folder,
  FileText,
  ChevronRight,
  Upload,
} from "lucide-react";

function SkillsHubSkeleton() {
  return (
    <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="border border-border rounded-lg p-3 flex flex-col gap-2"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-24" />
          </div>
          <div className="flex items-center justify-between mt-auto h-7">
            <Skeleton className="h-3 w-10" />
            <div className="flex gap-1">
              <Skeleton className="h-7 w-7" />
              <Skeleton className="h-7 w-7" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function normalizeImportValidationMessages(
  t: (key: string, options?: Record<string, any>) => string,
  detail?: string,
): string[] {
  if (!detail) return [];
  const raw = detail.trim();
  const normalized = raw.replace(/^Invalid skill folder:\s*/i, "").trim();
  const source = normalized || raw;

  const table: Array<[RegExp, string]> = [
    [
      /directory does not exist/i,
      "skills.import.validation.directory-not-exist",
    ],
    [/SKILL\.md is required/i, "skills.import.validation.skill-md-required"],
    [/must be UTF-8 text/i, "skills.import.validation.utf8-required"],
    [/cannot read SKILL\.md/i, "skills.import.validation.skill-md-unreadable"],
    [
      /must start with YAML frontmatter/i,
      "skills.import.validation.frontmatter-required",
    ],
    [
      /malformed SKILL\.md frontmatter/i,
      "skills.import.validation.frontmatter-malformed",
    ],
    [
      /frontmatter closing '\-\-\-' is missing/i,
      "skills.import.validation.frontmatter-closing-missing",
    ],
    [
      /frontmatter 'name' is required/i,
      "skills.import.validation.name-required",
    ],
    [
      /frontmatter 'description' is required/i,
      "skills.import.validation.description-required",
    ],
    [
      /frontmatter 'allowed-tools' is required/i,
      "skills.import.validation.allowed-tools-required",
    ],
    [
      /frontmatter 'name' must match/i,
      "skills.import.validation.name-format-invalid",
    ],
    [
      /frontmatter 'description' is too short/i,
      "skills.import.validation.description-too-short",
    ],
    [
      /frontmatter 'description' is too long/i,
      "skills.import.validation.description-too-long",
    ],
    [
      /frontmatter 'allowed-tools' is too long/i,
      "skills.import.validation.allowed-tools-too-long",
    ],
    [
      /frontmatter 'allowed-tools' format is invalid/i,
      "skills.import.validation.allowed-tools-invalid",
    ],
    [/SKILL\.md body is too short/i, "skills.import.validation.body-too-short"],
    [/SKILL\.md body is too long/i, "skills.import.validation.body-too-long"],
    [
      /must include at least one Markdown heading/i,
      "skills.import.validation.heading-required",
    ],
    [
      /directory name must match frontmatter 'name'/i,
      "skills.import.validation.folder-name-mismatch",
    ],
  ];

  const messages: string[] = [];
  for (const [rule, key] of table) {
    if (rule.test(source)) {
      messages.push(t(key));
      break;
    }
  }
  if (messages.length === 0) {
    messages.push(source);
  }
  return messages;
}

function SkillModal({ skill, onClose, onSave }: any) {
  const { t } = useTranslation();
  const [form, setForm] = useState(
    skill || {
      name: "",
      description: "",
      skill_type: "prompt",
      content_json: '{"prompt":""}',
    },
  );
  const contentRef = useRef<HTMLTextAreaElement>(null);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-base">
            {skill ? t("skills.modal.edit-title") : t("skills.modal.new-title")}
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-3">
          <div className="space-y-1.5">
            <Label>{t("skills.modal.name-required")}</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("type")}</Label>
            <Select
              value={form.skill_type}
              onValueChange={(v) => setForm({ ...form, skill_type: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="prompt">
                  {t("skills.type.prompt")}
                </SelectItem>
                <SelectItem value="chain">{t("skills.type.chain")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>{t("description")}</Label>
            <Input
              value={form.description || ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t("skills.modal.content-json")}</Label>
            <Textarea
              ref={contentRef}
              className="font-mono text-xs min-h-[100px]"
              value={form.content_json}
              onChange={(e) =>
                setForm({ ...form, content_json: e.target.value })
              }
            />
          </div>
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border sm:justify-end">
          <Button variant="outline" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() =>
              onSave({
                ...form,
                content_json: contentRef.current?.value ?? form.content_json,
              })
            }
            disabled={!form.name}
          >
            {t("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportSkillDialog({
  onClose,
  onImport,
  loading,
  errorDetail,
}: {
  onClose: () => void;
  onImport: (folderPath: string) => void;
  loading: boolean;
  errorDetail?: string;
}) {
  const { t } = useTranslation();
  const [folderPath, setFolderPath] = useState("");
  const errorMessages = useMemo(
    () => normalizeImportValidationMessages(t, errorDetail),
    [errorDetail, t],
  );

  const handlePick = async () => {
    const picked = await pickDirectory();
    if (picked) setFolderPath(picked);
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-base">
            {t("skills.import.dialog.title")}
          </DialogTitle>
        </DialogHeader>
        <div className="p-5 space-y-3">
          <p className="text-xs text-muted-foreground">
            {t("skills.import.dialog.description")}
          </p>
          <div className="space-y-1.5">
            <Label>{t("skills.import.dialog.folder-path")}</Label>
            <div className="flex items-center gap-2">
              <Input
                value={folderPath}
                onChange={(e) => setFolderPath(e.target.value)}
                placeholder="/path/to/skill-folder"
              />
              <Button variant="outline" onClick={handlePick}>
                {t("skills.import.dialog.pick")}
              </Button>
            </div>
          </div>
          {errorMessages.length > 0 && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-xs font-medium text-destructive">
                {t("skills.import.dialog.failed-check")}
              </p>
              <ul className="mt-1.5 list-disc pl-4 space-y-1">
                {errorMessages.map((msg, idx) => (
                  <li
                    key={`${idx}-${msg}`}
                    className="text-xs text-destructive"
                  >
                    {msg}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border sm:justify-end">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            {t("cancel")}
          </Button>
          <Button
            onClick={() => onImport(folderPath.trim())}
            disabled={!folderPath.trim() || loading}
          >
            {loading
              ? t("skills.import.dialog.importing")
              : t("skills.import.dialog.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SkillsHubTab({
  installedPackageNames,
  search,
}: {
  installedPackageNames: Set<string>;
  search: string;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [debouncedQ, setDebouncedQ] = useState("");
  const [installingPkg, setInstallingPkg] = useState<string | null>(null);
  const [justInstalled, setJustInstalled] = useState<Set<string>>(new Set());
  const [installError, setInstallError] = useState("");
  const [previewingItem, setPreviewingItem] = useState<any>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQ(search.trim()), 500);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: hubItems = [], isLoading } = useQuery({
    queryKey: ["skills-hub"],
    queryFn: () => skillsApi.hubList().then((r) => r.data),
  });
  const { isFetching: isSearching, data: onlineResults = [] } = useQuery({
    queryKey: ["skills-online-search", debouncedQ],
    queryFn: () =>
      debouncedQ
        ? skillsApi.search(debouncedQ).then((r) => r.data)
        : Promise.resolve([]),
    enabled: !!debouncedQ,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const localFiltered = q
      ? (hubItems as any[]).filter(
          (item) =>
            item.skill_name.toLowerCase().includes(q) ||
            item.owner.toLowerCase().includes(q) ||
            item.repo.toLowerCase().includes(q),
        )
      : (hubItems as any[]);
    if (!debouncedQ || (onlineResults as any[]).length === 0)
      return localFiltered;
    const localRefs = new Set(localFiltered.map((i: any) => i.package_ref));
    const extra = (onlineResults as any[])
      .filter((r: any) => !localRefs.has(r.package_ref))
      .map((r: any) => ({
        id: r.package_ref,
        skill_name: r.name,
        owner: r.owner,
        repo: r.repo,
        package_ref: r.package_ref,
        source_url: r.source_url,
        install_count: r.install_count,
      }));
    return [...localFiltered, ...extra];
  }, [hubItems, search, debouncedQ, onlineResults]);

  const handleInstall = async (item: any) => {
    setInstallingPkg(item.package_ref);
    setInstallError("");
    try {
      await skillsApi.install(item.package_ref);
      setJustInstalled((prev) => new Set(prev).add(item.package_ref));
      qc.invalidateQueries({ queryKey: ["skills"] });
      addToast({
        type: "success",
        message: t("skills.toast.install-success", { name: item.skill_name }),
      });
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      setInstallError(
        detail || t("skills.toast.install-failed", { name: item.skill_name }),
      );
    } finally {
      setInstallingPkg(null);
    }
  };

  const isInstalled = (pkg: string) =>
    installedPackageNames.has(pkg) || justInstalled.has(pkg);
  const isPending = search.trim() !== debouncedQ;
  const isLoadingAny = isLoading || isPending || isSearching;

  return (
    <div className="space-y-3">
      {installError && (
        <p className="text-sm text-destructive">{installError}</p>
      )}
      {isLoadingAny ? (
        <SkillsHubSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Globe className="w-5 h-5 text-muted-foreground" />}
          title={t("skills.empty-title")}
          description={
            search.trim()
              ? t("skills.empty.not-found-description", {
                  search: search.trim(),
                })
              : t("skills.empty-description")
          }
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {filtered.map((item: any) => {
            const installed = isInstalled(item.package_ref);
            const installing = installingPkg === item.package_ref;
            return (
              <div
                key={item.id ?? item.package_ref}
                className="group border border-border rounded-lg p-3 flex flex-col gap-2"
              >
                <div className="min-w-0">
                  <p className="font-medium text-sm truncate">
                    {item.skill_name}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {item.owner}/{item.repo}
                  </p>
                </div>
                <div className="flex items-center justify-between mt-auto h-7">
                  {item.install_count ? (
                    <span className="text-xs text-muted-foreground">
                      ↓ {item.install_count}
                    </span>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center">
                    {installing ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : installed ? (
                      <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    ) : (
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => setPreviewingItem(item)}
                              className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Preview</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              onClick={() => handleInstall(item)}
                              className="flex items-center justify-center h-7 w-7 rounded-md hover:bg-muted transition-colors"
                            >
                              <Download className="w-4 h-4" />
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>Install</TooltipContent>
                        </Tooltip>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {previewingItem && (
        <HubSkillFilesDialog
          item={previewingItem}
          onClose={() => setPreviewingItem(null)}
        />
      )}
    </div>
  );
}

type SkillFileTreeItem = {
  name: string;
  path: string;
  type: "file" | "dir";
  size: number | null;
};

function SkillFilesDialog({
  skill,
  onClose,
}: {
  skill: any;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [nodesByPath, setNodesByPath] = useState<
    Record<string, SkillFileTreeItem[]>
  >({});
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [treeError, setTreeError] = useState("");

  const loadDirectory = async (dirPath: string) => {
    if (nodesByPath[dirPath]) return;
    setLoadingDirs((prev) => new Set(prev).add(dirPath));
    try {
      const { data } = await skillsApi.fileTree(skill.id, dirPath || undefined);
      setNodesByPath((prev) => ({
        ...prev,
        [dirPath]: (data?.items || []) as SkillFileTreeItem[],
      }));
      if (!selectedFilePath) {
        const firstFile = ((data?.items || []) as SkillFileTreeItem[]).find(
          (item) => item.type === "file",
        );
        if (firstFile) setSelectedFilePath(firstFile.path);
      }
    } catch (e: any) {
      setTreeError(
        e?.response?.data?.detail || t("skills.file-browser.load-tree-failed"),
      );
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  };

  useEffect(() => {
    loadDirectory("");
  }, []);

  const contentQuery = useQuery({
    queryKey: ["skill-file-content", skill.id, selectedFilePath],
    queryFn: () =>
      skillsApi
        .fileContent(skill.id, selectedFilePath as string)
        .then((r) => r.data),
    enabled: !!selectedFilePath,
  });

  const toggleFolder = (dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
    if (!nodesByPath[dirPath]) {
      loadDirectory(dirPath);
    }
  };

  const renderNodes = (dirPath: string, depth: number): JSX.Element[] => {
    const nodes = nodesByPath[dirPath] || [];
    const lines: JSX.Element[] = [];
    nodes.forEach((item) => {
      const isDir = item.type === "dir";
      const isExpanded = expanded.has(item.path);
      const isLoading = loadingDirs.has(item.path);
      lines.push(
        <button
          key={item.path}
          type="button"
          className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left hover:bg-muted ${selectedFilePath === item.path ? "bg-muted" : ""}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            if (isDir) {
              toggleFolder(item.path);
              return;
            }
            setSelectedFilePath(item.path);
          }}
        >
          {isDir ? (
            <>
              <ChevronRight
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
              <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            </>
          ) : (
            <>
              <span className="w-3.5 h-3.5 shrink-0" />
              <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="truncate">{item.name}</span>
          {isLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
        </button>,
      );

      if (isDir && isExpanded) {
        lines.push(...renderNodes(item.path, depth + 1));
      }
    });
    return lines;
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-base">
            {t("skills.file-browser.title", { name: skill.name })}
          </DialogTitle>
        </DialogHeader>
        <div className="h-[70vh] grid grid-cols-[280px_1fr]">
          <div className="border-r border-border overflow-auto p-2">
            {treeError ? (
              <p className="text-xs text-destructive p-2">{treeError}</p>
            ) : (
              <div className="space-y-0.5">{renderNodes("", 0)}</div>
            )}
            {loadingDirs.has("") && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t("loading")}</span>
              </div>
            )}
          </div>

          <div className="overflow-hidden p-4">
            {!selectedFilePath ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t("skills.file-browser.select-file")}
              </div>
            ) : contentQuery.isLoading ? (
              <div className="h-full flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t("skills.file-browser.loading-content")}</span>
              </div>
            ) : contentQuery.error ? (
              <div className="h-full flex items-center justify-center text-sm text-destructive">
                {(contentQuery.error as any)?.response?.data?.detail ||
                  t("skills.file-browser.read-content-failed")}
              </div>
            ) : (
              <div className="h-full flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{contentQuery.data?.path}</span>
                  {contentQuery.data?.truncated && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("skills.file-browser.truncated")}
                    </Badge>
                  )}
                </div>
                <div className="flex-1 overflow-auto rounded border border-border bg-muted/20 p-3">
                  <pre className="text-xs leading-5 whitespace-pre-wrap break-words font-mono">
                    {contentQuery.data?.content || ""}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HubSkillFilesDialog({
  item,
  onClose,
}: {
  item: any;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [nodesByPath, setNodesByPath] = useState<
    Record<string, SkillFileTreeItem[]>
  >({});
  const [loadingDirs, setLoadingDirs] = useState<Set<string>>(new Set());
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [treeError, setTreeError] = useState("");

  const loadDirectory = async (dirPath: string) => {
    if (nodesByPath[dirPath]) return;
    setLoadingDirs((prev) => new Set(prev).add(dirPath));
    try {
      const { data } = await skillsApi.hubFileTree(
        item.package_ref,
        dirPath || undefined,
      );
      setNodesByPath((prev) => ({
        ...prev,
        [dirPath]: (data?.items || []) as SkillFileTreeItem[],
      }));
      if (!selectedFilePath) {
        const firstFile = ((data?.items || []) as SkillFileTreeItem[]).find(
          (entry) => entry.type === "file",
        );
        if (firstFile) setSelectedFilePath(firstFile.path);
      }
    } catch (e: any) {
      setTreeError(
        e?.response?.data?.detail ||
          t("skills.file-browser.load-remote-tree-failed"),
      );
    } finally {
      setLoadingDirs((prev) => {
        const next = new Set(prev);
        next.delete(dirPath);
        return next;
      });
    }
  };

  useEffect(() => {
    loadDirectory("");
  }, []);

  const contentQuery = useQuery({
    queryKey: ["hub-skill-file-content", item.package_ref, selectedFilePath],
    queryFn: () =>
      skillsApi
        .hubFileContent(item.package_ref, selectedFilePath as string)
        .then((r) => r.data),
    enabled: !!selectedFilePath,
  });

  const toggleFolder = (dirPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
    if (!nodesByPath[dirPath]) {
      loadDirectory(dirPath);
    }
  };

  const renderNodes = (dirPath: string, depth: number): JSX.Element[] => {
    const nodes = nodesByPath[dirPath] || [];
    const lines: JSX.Element[] = [];
    nodes.forEach((entry) => {
      const isDir = entry.type === "dir";
      const isExpanded = expanded.has(entry.path);
      const isLoading = loadingDirs.has(entry.path);
      lines.push(
        <button
          key={entry.path}
          type="button"
          className={`w-full flex items-center gap-1.5 px-2 py-1 rounded text-xs text-left hover:bg-muted ${selectedFilePath === entry.path ? "bg-muted" : ""}`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onClick={() => {
            if (isDir) {
              toggleFolder(entry.path);
              return;
            }
            setSelectedFilePath(entry.path);
          }}
        >
          {isDir ? (
            <>
              <ChevronRight
                className={`w-3.5 h-3.5 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`}
              />
              <Folder className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            </>
          ) : (
            <>
              <span className="w-3.5 h-3.5 shrink-0" />
              <FileText className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
          <span className="truncate">{entry.name}</span>
          {isLoading && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
        </button>,
      );

      if (isDir && isExpanded) {
        lines.push(...renderNodes(entry.path, depth + 1));
      }
    });
    return lines;
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-6xl p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border">
          <DialogTitle className="text-base">
            {t("skills.file-browser.remote-title", { name: item.skill_name })}
          </DialogTitle>
        </DialogHeader>
        <div className="h-[70vh] grid grid-cols-[280px_1fr]">
          <div className="border-r border-border overflow-auto p-2">
            {treeError ? (
              <p className="text-xs text-destructive p-2">{treeError}</p>
            ) : (
              <div className="space-y-0.5">{renderNodes("", 0)}</div>
            )}
            {loadingDirs.has("") && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground px-2 py-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>{t("loading")}</span>
              </div>
            )}
          </div>

          <div className="overflow-hidden p-4">
            {!selectedFilePath ? (
              <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
                {t("skills.file-browser.select-file")}
              </div>
            ) : contentQuery.isLoading ? (
              <div className="h-full flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>{t("skills.file-browser.loading-content")}</span>
              </div>
            ) : contentQuery.error ? (
              <div className="h-full flex items-center justify-center text-sm text-destructive">
                {(contentQuery.error as any)?.response?.data?.detail ||
                  t("skills.file-browser.read-content-failed")}
              </div>
            ) : (
              <div className="h-full flex flex-col gap-2">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="truncate">{contentQuery.data?.path}</span>
                  {contentQuery.data?.truncated && (
                    <Badge variant="outline" className="text-[10px]">
                      {t("skills.file-browser.truncated")}
                    </Badge>
                  )}
                </div>
                <div className="flex-1 overflow-auto rounded border border-border bg-muted/20 p-3">
                  <pre className="text-xs leading-5 whitespace-pre-wrap break-words font-mono">
                    {contentQuery.data?.content || ""}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function InstalledTab({ search }: { search: string }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [editing, setEditing] = useState<any>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingDeleteSkill, setPendingDeleteSkill] = useState<any>(null);
  const [viewingSkill, setViewingSkill] = useState<any>(null);
  const [error, setError] = useState("");

  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: () => skillsApi.list().then((r) => r.data),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: any) => skillsApi.update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      setEditing(null);
    },
  });

  const handleUpdateSingle = async (skill: any) => {
    setUpdatingId(skill.id);
    setError("");
    try {
      await skillsApi.updateSingle(skill.id);
      qc.invalidateQueries({ queryKey: ["skills"] });
      addToast({
        type: "success",
        message: t("skills.toast.update-success", { name: skill.name }),
      });
    } catch (e: any) {
      setError(
        e?.response?.data?.detail ||
          t("skills.toast.update-failed", { name: skill.name }),
      );
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDelete = async (skill: any) => {
    setDeletingId(skill.id);
    setError("");
    try {
      await skillsApi.delete(skill.id);
      await qc.invalidateQueries({ queryKey: ["skills"] });
      addToast({
        type: "success",
        message: t("skills.toast.deleted", { name: skill.name }),
      });
    } catch (e: any) {
      setError(
        e?.response?.data?.detail ||
          t("skills.toast.delete-failed", { name: skill.name }),
      );
    } finally {
      setDeletingId(null);
    }
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return q
      ? (skills as any[]).filter(
          (s) =>
            s.name.toLowerCase().includes(q) ||
            (s.description || "").toLowerCase().includes(q),
        )
      : (skills as any[]);
  }, [skills, search]);

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {filtered.length === 0 ? (
        <EmptyState
          icon={<Zap className="w-5 h-5 text-muted-foreground" />}
          title={t("skills.empty.installed-title")}
          description={t("skills.empty.installed-description")}
        />
      ) : (
        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-4">
          {filtered.map((skill: any) => {
            const isPackage = skill.source === "package";
            const isUpdating = updatingId === skill.id;
            const isDeleting = deletingId === skill.id;
            return (
              <div
                key={skill.id}
                className="group relative border border-border rounded-lg p-3"
              >
                <div className="flex items-start gap-2.5">
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isPackage ? "bg-amber-50 dark:bg-amber-900/20" : "bg-amber-50 dark:bg-amber-900/20"}`}
                  >
                    {isPackage ? (
                      <Globe className="w-3.5 h-3.5 text-amber-500" />
                    ) : (
                      <Wrench className="w-3.5 h-3.5 text-amber-500" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="font-medium text-sm truncate">
                      {skill.name}
                    </h3>
                    {skill.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                        {skill.description}
                      </p>
                    )}
                    <div className="flex gap-1 mt-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {skill.skill_type}
                      </Badge>
                    </div>
                  </div>
                </div>
                <div className="absolute top-2 right-2 hidden group-hover:flex gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        disabled={isUpdating || isDeleting}
                        onClick={() => setViewingSkill(skill)}
                      >
                        <Eye className="w-3 h-3" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View skill</TooltipContent>
                  </Tooltip>
                  {isPackage && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={isUpdating || isDeleting}
                          onClick={() => handleUpdateSingle(skill)}
                        >
                          {isUpdating ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <RefreshCw className="w-3 h-3" />
                          )}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Update skill</TooltipContent>
                    </Tooltip>
                  )}
                  {!isPackage && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          disabled={isDeleting}
                          onClick={() => setEditing(skill)}
                        >
                          <Pencil className="w-3 h-3" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Edit skill</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 hover:text-destructive"
                        disabled={isUpdating || isDeleting}
                        onClick={() => setPendingDeleteSkill(skill)}
                      >
                        {isDeleting ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Trash2 className="w-3 h-3" />
                        )}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Delete skill</TooltipContent>
                  </Tooltip>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <SkillModal
          skill={editing}
          onClose={() => setEditing(null)}
          onSave={(form: any) =>
            updateMut.mutate({ id: editing.id, data: form })
          }
        />
      )}
      {viewingSkill && (
        <SkillFilesDialog
          skill={viewingSkill}
          onClose={() => setViewingSkill(null)}
        />
      )}

      <ConfirmDialog
        open={!!pendingDeleteSkill}
        onOpenChange={(open) => {
          if (!open) setPendingDeleteSkill(null);
        }}
        title={t("skills.confirm-delete-title")}
        description={
          pendingDeleteSkill
            ? t("skills.confirm-delete-description", {
                name: pendingDeleteSkill.name,
              })
            : undefined
        }
        confirmText={t("delete")}
        onConfirm={() => {
          if (!pendingDeleteSkill) return;
          handleDelete(pendingDeleteSkill);
          setPendingDeleteSkill(null);
        }}
        loading={!!pendingDeleteSkill && deletingId === pendingDeleteSkill.id}
      />
    </div>
  );
}

export default function SkillsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const addToast = useToastStore((s) => s.addToast);
  const [showImportModal, setShowImportModal] = useState(false);
  const [activeTab, setActiveTab] = useState("hub");
  const [hubSearch, setHubSearch] = useState("");
  const [installedSearch, setInstalledSearch] = useState("");
  const [updatingAll, setUpdatingAll] = useState(false);
  const [importErrorDetail, setImportErrorDetail] = useState("");
  const actionBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = actionBarRef.current;
    if (!bar) return;
    const container =
      bar.closest("[class*='overflow-y-auto']") || bar.parentElement;
    if (!container) return;
    const onScroll = () => {
      bar.classList.toggle("scrolled", container.scrollTop > 0);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  const { data: skills = [] } = useQuery({
    queryKey: ["skills"],
    queryFn: () => skillsApi.list().then((r) => r.data),
  });

  const installedPackageNames = useMemo<Set<string>>(
    () =>
      new Set(
        (skills as any[])
          .filter((s) => s.package_name)
          .map((s) => s.package_name),
      ),
    [skills],
  );

  const importMut = useMutation({
    mutationFn: (folderPath: string) => skillsApi.importFolder(folderPath),
    onSuccess: (res: any) => {
      qc.invalidateQueries({ queryKey: ["skills"] });
      setShowImportModal(false);
      setImportErrorDetail("");
      setActiveTab("installed");
      addToast({
        type: "success",
        message: t("skills.import.toast.success", {
          name: res?.data?.name || "",
        }),
      });
    },
    onError: (e: any) => {
      const detail =
        e?.response?.data?.detail || t("skills.import.toast.invalid-folder");
      setImportErrorDetail(detail);
      addToast({
        type: "error",
        message: t("skills.import.toast.failed-guidance"),
      });
    },
  });

  const handleUpdateAll = async () => {
    setUpdatingAll(true);
    try {
      await skillsApi.updateAll();
      qc.invalidateQueries({ queryKey: ["skills"] });
      addToast({
        type: "success",
        message: t("skills.toast.update-all-success"),
      });
    } catch (e: any) {
      addToast({
        type: "error",
        message:
          e?.response?.data?.detail || t("skills.toast.update-all-failed"),
      });
    } finally {
      setUpdatingAll(false);
    }
  };

  return (
    <div className="pt-4 px-6 pb-6 space-y-5">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <div ref={actionBarRef} className="sticky-action-bar pt-3 pb-4">
          <div className="flex items-center justify-between gap-3">
            <TabsList>
              <TabsTrigger value="hub" className="gap-1.5 text-xs">
                <Globe className="w-3.5 h-3.5" />
                Skills Hub
              </TabsTrigger>
              <TabsTrigger value="installed" className="gap-1.5 text-xs">
                <Zap className="w-3.5 h-3.5" />
                {t("skills.installed")}
                {(skills as any[]).length > 0 && (
                  <Badge variant="secondary" className="text-[10px] px-1 py-0">
                    {(skills as any[]).length}
                  </Badge>
                )}
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-1.5">
              {activeTab === "installed" && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleUpdateAll}
                      disabled={updatingAll}
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${updatingAll ? "animate-spin" : ""}`}
                      />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Update all skills</TooltipContent>
                </Tooltip>
              )}
              <div className="relative w-48">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <Input
                  placeholder={
                    activeTab === "hub"
                      ? t("skills.search-hub-placeholder")
                      : t("skills.search-installed-placeholder")
                  }
                  value={activeTab === "hub" ? hubSearch : installedSearch}
                  onChange={(e) =>
                    activeTab === "hub"
                      ? setHubSearch(e.target.value)
                      : setInstalledSearch(e.target.value)
                  }
                  className="pl-8 h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setImportErrorDetail("");
                  setShowImportModal(true);
                }}
              >
                <Upload className="w-3.5 h-3.5" />
                {t("skills.import.dialog.title")}
              </Button>
            </div>
          </div>
        </div>

        <TabsContent value="hub" className="mt-3">
          <SkillsHubTab
            installedPackageNames={installedPackageNames}
            search={hubSearch}
          />
        </TabsContent>
        <TabsContent value="installed" className="mt-3">
          <InstalledTab search={installedSearch} />
        </TabsContent>
      </Tabs>

      {showImportModal && (
        <ImportSkillDialog
          onClose={() => {
            setShowImportModal(false);
            setImportErrorDetail("");
          }}
          onImport={(folderPath) => importMut.mutate(folderPath)}
          loading={importMut.isPending}
          errorDetail={importErrorDetail}
        />
      )}
    </div>
  );
}
