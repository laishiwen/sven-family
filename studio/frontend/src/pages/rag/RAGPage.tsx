import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { capabilitiesApi, ragApi } from "@/lib/api";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import {
  AlertCircle, Blocks, BookOpen, BrainCircuit, CheckCircle2,
  Database, Download, FileEdit, FileText, HelpCircle, Loader2,
  MoreHorizontal, Pencil, Plus, RefreshCw, RotateCcw, Search,
  Trash, Trash2, Upload,
} from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

type CapabilityOption = { value: string; label: string; description?: string; provider_type?: string | null; is_default?: boolean };
type CapabilityRegistry = {
  file_formats: CapabilityOption[]; preprocessors: CapabilityOption[]; chunk_strategies: CapabilityOption[];
  metadata_modes: CapabilityOption[]; embeddings: CapabilityOption[]; rerankers: CapabilityOption[];
  defaults?: { rag?: { preprocessor?: string; chunk_strategy?: string; chunk_size?: number; chunk_overlap?: number; metadata_mode?: string; retrieval_top_k?: number } };
};
type CreateKBPayload = {
  name: string; description: string; embedding_provider_type: string; embedding_model_id: string; reranker_model_id: string | null;
  chunk_strategy: string; chunk_size: number; chunk_overlap: number; metadata_mode: string; metadata_template_json: string;
  retrieval_top_k: number; parser_config_json: string; retrieval_config_json: string;
};
type DocumentPreviewPayload = { document_id: string; filename: string; status: string; chunk_count: number; preview_text: string; preprocessor: string; truncated: boolean };
type DocumentRecord = { id: string; kb_id: string; filename: string; file_path: string; file_size: number; status: string; chunk_count: number; error_msg?: string | null; updated_at?: string };
type KnowledgeBaseRecord = CreateKBPayload & { id: string; doc_count: number; chunk_count: number; status: string; created_at?: string };
type QueryDebugPayload = {
  top_k_requested: number; similarity_top_k: number; initial_result_count: number; metadata_filtered_count: number;
  thresholded_result_count: number; returned_result_count: number; applied_min_score?: number | null; applied_hybrid_rerank: boolean;
};

const EN_CAPABILITY_LABELS: Record<string, string> = { native: "Standard Parsing", markitdown: "Enhanced Parsing", sentence: "Sentence", paragraph: "Paragraph", token: "Token", markdown: "Markdown Structure", auto: "Auto", custom: "Custom Template", disabled: "Disabled" };

function isEnglishLocale(locale?: string | null) { return (locale || "").toLowerCase().startsWith("en"); }
function capabilityOptionLabel(value: string | null | undefined, options: CapabilityOption[] | undefined, locale?: string | null) {
  if (!value) return "";
  const option = options?.find((item) => item.value === value);
  if (!isEnglishLocale(locale)) return option?.label || value;
  return EN_CAPABILITY_LABELS[value] || option?.value || value;
}

function numericValue(value: string, fallback: number) { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : fallback; }
function providerLabel(providerType: string) { if (!providerType) return i18n.t("rag.not-set"); return providerType.charAt(0).toUpperCase() + providerType.slice(1); }
function safeJsonParse(value?: string | null) { if (!value) return {}; try { return JSON.parse(value); } catch { return {}; } }
function statusBadgeVariant(status: string) { if (status === "ready" || status === "done") return "default" as const; if (status === "error") return "destructive" as const; return "secondary" as const; }
function parserModeLabel(preprocessor?: string | null, locale?: string | null) {
  if (isEnglishLocale(locale)) return preprocessor === "markitdown" ? "Enhanced Parsing" : "Standard Parsing";
  return preprocessor === "markitdown" ? i18n.t("rag.enhanced-parsing") : i18n.t("rag.standard-parsing");
}
function documentStatusLabel(status: string, chunkCount?: number) {
  if (status === "processing") return i18n.t("rag.processing"); if (status === "pending") return i18n.t("rag.pending");
  if (status === "done") return `${Math.min(chunkCount || 0, 999)} chunks`; if (status === "error") return i18n.t("rag.failed");
  return status;
}
function compactErrorMessage(message?: string | null) { if (!message) return i18n.t("rag.default-error"); return message.length > 88 ? `${message.slice(0, 88)}...` : message; }
function formatUpdatedAt(value?: string) { if (!value) return null; const date = new Date(value); if (Number.isNaN(date.getTime())) return null; return new Intl.DateTimeFormat(i18n.language || "en", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(date); }
function knowledgeBaseStatusTone(status: string) { if (status === "ready") return "bg-emerald-500"; if (status === "ingesting") return "bg-amber-500"; if (status === "error") return "bg-rose-500"; return "bg-slate-400"; }

function CreateKBModal({ capabilities, knowledgeBase, onClose, onSave, isPending }: {
  capabilities?: CapabilityRegistry; knowledgeBase?: KnowledgeBaseRecord | null; onClose: () => void; onSave: (payload: CreateKBPayload) => void; isPending?: boolean;
}) {
  const { t, i18n: i18nInst } = useTranslation();
  const locale = i18nInst.resolvedLanguage || i18nInst.language;
  const [step, setStep] = useState(1);
  const ragDefaults = capabilities?.defaults?.rag;
  const parserConfig = safeJsonParse(knowledgeBase?.parser_config_json);
  const retrievalConfig = safeJsonParse(knowledgeBase?.retrieval_config_json);
  const markitdownConfig = parserConfig?.markitdown || {};
  const [preprocessor, setPreprocessor] = useState(parserConfig?.preprocessor || ragDefaults?.preprocessor || "native");
  const [markitdownUsePlugins, setMarkitdownUsePlugins] = useState(Boolean(markitdownConfig?.use_plugins));
  const [markitdownFallback, setMarkitdownFallback] = useState(markitdownConfig?.fallback_to_native ?? true);
  const [markitdownPreferMarkdown, setMarkitdownPreferMarkdown] = useState(markitdownConfig?.prefer_markdown_chunking ?? true);
  const [defaultMinScore, setDefaultMinScore] = useState(String(retrievalConfig?.min_score ?? 0.2));
  const [defaultHybridRerank, setDefaultHybridRerank] = useState(retrievalConfig?.enable_hybrid_rerank ?? true);

  const [form, setForm] = useState<CreateKBPayload>({
    name: knowledgeBase?.name || "", description: knowledgeBase?.description || "",
    embedding_provider_type: knowledgeBase?.embedding_provider_type || "openai",
    embedding_model_id: knowledgeBase?.embedding_model_id || "text-embedding-3-small",
    reranker_model_id: knowledgeBase?.reranker_model_id || null,
    chunk_strategy: knowledgeBase?.chunk_strategy || ragDefaults?.chunk_strategy || "sentence",
    chunk_size: knowledgeBase?.chunk_size || ragDefaults?.chunk_size || 512,
    chunk_overlap: knowledgeBase?.chunk_overlap || ragDefaults?.chunk_overlap || 50,
    metadata_mode: knowledgeBase?.metadata_mode || ragDefaults?.metadata_mode || "auto",
    metadata_template_json: knowledgeBase?.metadata_template_json || '{"source":"{{filename}}","imported_at":"{{timestamp}}"}',
    retrieval_top_k: knowledgeBase?.retrieval_top_k || ragDefaults?.retrieval_top_k || 5,
    parser_config_json: knowledgeBase?.parser_config_json || "{}",
    retrieval_config_json: knowledgeBase?.retrieval_config_json || "{}",
  });

  const providerOptions = useMemo(() => { const p = new Set<string>(); for (const opt of capabilities?.embeddings || []) { if (opt.provider_type) p.add(opt.provider_type); } return Array.from(p.values()); }, [capabilities?.embeddings]);
  const embeddingOptions = useMemo(() => (capabilities?.embeddings || []).filter((opt) => !opt.provider_type || opt.provider_type === form.embedding_provider_type), [capabilities?.embeddings, form.embedding_provider_type]);
  const rerankerOptions = useMemo(() => (capabilities?.rerankers || []).filter((opt) => !opt.provider_type || opt.provider_type === form.embedding_provider_type), [capabilities?.rerankers, form.embedding_provider_type]);
  const preprocessorOptions = capabilities?.preprocessors || [];

  const handleProviderChange = (providerType: string) => {
    const defaultEmbedding = (capabilities?.embeddings || []).find((o) => o.provider_type === providerType && o.is_default);
    const defaultReranker = (capabilities?.rerankers || []).find((o) => o.provider_type === providerType && o.is_default);
    setForm((c) => ({ ...c, embedding_provider_type: providerType, embedding_model_id: defaultEmbedding?.value || c.embedding_model_id, reranker_model_id: defaultReranker?.value || null }));
  };

  const commit = () => {
    onSave({
      ...form,
      parser_config_json: JSON.stringify({ preprocessor, markitdown: { enabled: preprocessor === "markitdown", use_plugins: markitdownUsePlugins, fallback_to_native: markitdownFallback, prefer_markdown_chunking: markitdownPreferMarkdown }, file_formats: (capabilities?.file_formats || []).map((item) => item.value), chunk_strategy: form.chunk_strategy }, null, 2),
      retrieval_config_json: JSON.stringify({ top_k: form.retrieval_top_k, reranker_model_id: form.reranker_model_id, metadata_mode: form.metadata_mode, min_score: Math.min(Math.max(defaultMinScore.trim() ? numericValue(defaultMinScore, 0.2) : 0.2, 0), 1), enable_hybrid_rerank: defaultHybridRerank }, null, 2),
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl p-0 gap-0 max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader className="px-5 py-3 border-b border-border"><DialogTitle className="text-base">{knowledgeBase ? t("rag.edit-kb") : t("rag.create-kb")}</DialogTitle></DialogHeader>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {step === 1 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-sm">{t("rag.basic-info")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5"><Label>{t("rag.name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("rag.name-placeholder")} /></div>
                  <div className="space-y-1.5"><Label>{t("rag.description")}</Label><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder={t("rag.description-placeholder")} /></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">{t("rag.import-capability")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="rounded-lg border border-border bg-muted/30 p-3">
                    <div className="flex items-center gap-1.5 text-sm"><Database className="h-3.5 w-3.5" />{t("rag.supported-formats")}</div>
                    <p className="mt-1.5 text-xs text-muted-foreground">{(capabilities?.file_formats || []).map((f) => f.label).join(" / ") || "PDF / DOCX / TXT / Markdown / HTML / CSV / JSON"}</p>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-sm">{t("rag.provider-model")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5"><Label>{t("rag.embedding-provider-label")}</Label><Select value={form.embedding_provider_type} onValueChange={handleProviderChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{providerOptions.map((p) => <SelectItem key={p} value={p}>{providerLabel(p)}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>{t("rag.embedding-model-label")}</Label><Select value={form.embedding_model_id} onValueChange={(v) => setForm({ ...form, embedding_model_id: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{embeddingOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                  {rerankerOptions.length > 0 && (
                    <div className="space-y-1.5"><Label>{t("rag.reranker-label")}</Label><Select value={form.reranker_model_id || "none"} onValueChange={(v) => setForm({ ...form, reranker_model_id: v === "none" ? null : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("rag.disabled")}</SelectItem>{rerankerOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent></Select></div>
                  )}
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">{t("rag.chunk-strategy")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5"><Label>{t("rag.preprocessor")}</Label><Select value={preprocessor} onValueChange={setPreprocessor}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{preprocessorOptions.map((o) => <SelectItem key={o.value} value={o.value}>{capabilityOptionLabel(o.value, preprocessorOptions, locale)}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>{t("rag.chunk-strategy-label")}</Label><Select value={form.chunk_strategy} onValueChange={(v) => setForm({ ...form, chunk_strategy: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(capabilities?.chunk_strategies || []).map((o) => <SelectItem key={o.value} value={o.value}>{capabilityOptionLabel(o.value, capabilities?.chunk_strategies, locale)}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5"><Label>{t("rag.chunk-size-label")}</Label><Input type="number" value={form.chunk_size} onChange={(e) => setForm({ ...form, chunk_size: numericValue(e.target.value, 512) })} /></div>
                    <div className="space-y-1.5"><Label>{t("rag.chunk-overlap-label")}</Label><Input type="number" value={form.chunk_overlap} onChange={(e) => setForm({ ...form, chunk_overlap: numericValue(e.target.value, 50) })} /></div>
                  </div>
                  <div className="space-y-1.5"><Label>{t("rag.retrieval-top-k")}</Label><Input type="number" value={form.retrieval_top_k} onChange={(e) => setForm({ ...form, retrieval_top_k: numericValue(e.target.value, 5) })} /></div>
                </CardContent>
              </Card>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-3 md:grid-cols-2">
              <Card>
                <CardHeader><CardTitle className="text-sm">{t("rag.metadata-injection")}</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-1.5"><Label>{t("rag.metadata-mode")}</Label><Select value={form.metadata_mode} onValueChange={(v) => setForm({ ...form, metadata_mode: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(capabilities?.metadata_modes || []).map((o) => <SelectItem key={o.value} value={o.value}>{capabilityOptionLabel(o.value, capabilities?.metadata_modes, locale)}</SelectItem>)}</SelectContent></Select></div>
                  <div className="space-y-1.5"><Label>{t("rag.metadata-template")}</Label><Textarea className="min-h-[140px] font-mono text-xs" value={form.metadata_template_json} onChange={(e) => setForm({ ...form, metadata_template_json: e.target.value })} /></div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader><CardTitle className="text-sm">{t("rag.config-summary")}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm">
                  {[
                    [t("rag.kb"), form.name || t("rag.unfilled")],
                    [t("rag.provider"), providerLabel(form.embedding_provider_type)],
                    [t("rag.embedding"), form.embedding_model_id],
                    [t("rag.chunk"), `${capabilityOptionLabel(form.chunk_strategy, capabilities?.chunk_strategies, locale)} / ${form.chunk_size}`],
                    [t("rag.top-k"), form.retrieval_top_k],
                    [t("rag.default-threshold"), defaultMinScore || "0.2"],
                  ].map(([k, v]) => (
                    <div key={String(k)} className="flex items-center justify-between gap-2"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>
                  ))}
                </CardContent>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border flex-row justify-between sm:justify-between">
          <Button variant="outline" onClick={step === 1 ? onClose : () => setStep((c) => c - 1)}>{step === 1 ? t("cancel") : t("previous-step")}</Button>
          <Button disabled={!form.name.trim() || isPending} onClick={() => step < 3 ? setStep((c) => c + 1) : commit()}>
            {isPending && step === 3 && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            {step === 3 ? (knowledgeBase ? t("rag.save-config") : t("rag.create-kb")) : t("next-step")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function RAGPage() {
  const { t, i18n: i18nInst } = useTranslation();
  const locale = i18nInst.resolvedLanguage || i18nInst.language;
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [editingKB, setEditingKB] = useState<KnowledgeBaseRecord | null>(null);
  const [selectedKB, setSelectedKB] = useState<KnowledgeBaseRecord | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [queryResults, setQueryResults] = useState<any[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);
  const [hasQueried, setHasQueried] = useState(false);
  const [enableRewrite, setEnableRewrite] = useState(false);
  const [enableHybridRerank, setEnableHybridRerank] = useState(true);
  const [filterFilename, setFilterFilename] = useState("");
  const [queryMinScore, setQueryMinScore] = useState("0.20");
  const [rewrittenQuery, setRewrittenQuery] = useState<string | null>(null);
  const [queryDebug, setQueryDebug] = useState<QueryDebugPayload | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreviewPayload | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showTextInput, setShowTextInput] = useState(false);
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");

  const { data: capabilities } = useQuery<CapabilityRegistry>({ queryKey: ["capabilities", "rag"], queryFn: () => capabilitiesApi.registry().then((r) => r.data) });
  const { data: knowledgeBases = [] } = useQuery<KnowledgeBaseRecord[]>({ queryKey: ["knowledge-bases"], queryFn: () => ragApi.list().then((r) => r.data), refetchInterval: (q) => ((q.state.data as any[]) || []).some((kb: any) => kb.status === "ingesting") ? 1500 : false });
  const { data: documents = [] } = useQuery<DocumentRecord[]>({ queryKey: ["kb-docs", selectedKB?.id], queryFn: () => selectedKB ? ragApi.listDocuments(selectedKB.id).then((r) => r.data) : Promise.resolve([]), enabled: !!selectedKB, refetchInterval: (q) => ((q.state.data as any[]) || []).some((doc: any) => doc.status === "pending" || doc.status === "processing") ? 1500 : false });

  useEffect(() => {
    if (!selectedKB?.id) { if (knowledgeBases.length > 0) setSelectedKB(knowledgeBases[0]); return; }
    const next = knowledgeBases.find((kb: any) => kb.id === selectedKB.id);
    if (!next) { setSelectedKB(knowledgeBases.length > 0 ? knowledgeBases[0] : null); return; }
    if (next !== selectedKB) setSelectedKB(next);
  }, [knowledgeBases, selectedKB]);

  const createMutation = useMutation({ mutationFn: (p: CreateKBPayload) => ragApi.create(p), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); setShowCreate(false); } });
  const updateMutation = useMutation({
    mutationFn: async ({ id, payload, shouldReindex }: { id: string; payload: CreateKBPayload; shouldReindex: boolean }) => { const r = await ragApi.update(id, payload); if (shouldReindex) await ragApi.reindex(id); return r; },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kb-docs", selectedKB?.id] }); queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); setEditingKB(null); },
  });
  const deleteMutation = useMutation({ mutationFn: (id: string) => ragApi.delete(id), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); setSelectedKB(null); setQueryResults([]); } });
  const uploadTextMutation = useMutation({
    mutationFn: ({ kbId, title, content }: { kbId: string; title: string; content: string }) => ragApi.uploadText(kbId, title, content),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kb-docs", selectedKB?.id] }); queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); setShowTextInput(false); setTextTitle(""); setTextContent(""); },
  });
  const uploadMutation = useMutation({
    mutationFn: ({ kbId, file }: { kbId: string; file: File }) => ragApi.upload(kbId, file),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kb-docs", selectedKB?.id] }); queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); if (fileInputRef.current) fileInputRef.current.value = ""; },
  });
  const uploadBatchMutation = useMutation({
    mutationFn: ({ kbId, files }: { kbId: string; files: File[] }) => ragApi.uploadBatch(kbId, files),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kb-docs", selectedKB?.id] }); queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); if (fileInputRef.current) fileInputRef.current.value = ""; },
  });
  const reindexMutation = useMutation({ mutationFn: (kbId: string) => ragApi.reindex(kbId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kb-docs", selectedKB?.id] }); queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); } });
  const exportMutation = useMutation({
    mutationFn: (kbId: string) => ragApi.export(kbId),
    onSuccess: (response, kbId) => {
      const blob = new Blob([response.data], { type: "application/zip" }); const url = window.URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url;
      const kb = knowledgeBases.find((item: any) => item.id === kbId); link.download = `${(kb?.name || kbId).replace(/[^\w一-龥-]+/g, "-")}-export.zip`;
      document.body.appendChild(link); link.click(); link.remove(); window.URL.revokeObjectURL(url);
    },
  });
  const deleteDocumentMutation = useMutation({ mutationFn: ({ kbId, docId }: { kbId: string; docId: string }) => ragApi.deleteDocument(kbId, docId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kb-docs", selectedKB?.id] }); queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); } });
  const retryDocumentMutation = useMutation({ mutationFn: ({ kbId, docId }: { kbId: string; docId: string }) => ragApi.retryDocument(kbId, docId), onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["kb-docs", selectedKB?.id] }); queryClient.invalidateQueries({ queryKey: ["knowledge-bases"] }); } });
  const previewMutation = useMutation({ mutationFn: ({ kbId, docId }: { kbId: string; docId: string }) => ragApi.previewDocument(kbId, docId), onSuccess: (response) => { setPreviewDocument(response.data); } });

  const queryMutation = useMutation({
    mutationFn: ({ kbId, text, rewrite, metadataFilters, minScore, enableHybridRerank }: { kbId: string; text: string; rewrite?: boolean; metadataFilters?: Record<string, string>; minScore?: number; enableHybridRerank?: boolean }) =>
      ragApi.query(kbId, text, { rewrite, metadataFilters, minScore, enableHybridRerank }),
    onSuccess: (r) => { setQueryResults(r.data.results || []); setRewrittenQuery(r.data.rewritten_query || null); setQueryDebug(r.data.retrieval_debug || null); setQueryError(null); setHasQueried(true); },
    onError: (error: any) => { setQueryResults([]); setQueryDebug(null); setQueryError(error?.response?.data?.detail || error?.message || t("rag.query-failed")); setHasQueried(true); },
  });

  const handleQuery = async () => {
    if (!selectedKB || !query.trim()) return;
    const parsedMinScore = queryMinScore.trim() ? Number(queryMinScore) : undefined;
    if (parsedMinScore !== undefined && (!Number.isFinite(parsedMinScore) || parsedMinScore < 0 || parsedMinScore > 1)) { setQueryResults([]); setQueryDebug(null); setQueryError(t("rag.min-score-invalid")); setHasQueried(true); return; }
    queryMutation.mutate({ kbId: selectedKB.id, text: query.trim(), rewrite: enableRewrite, metadataFilters: filterFilename.trim() ? { filename: filterFilename.trim() } : undefined, minScore: parsedMinScore, enableHybridRerank });
  };

  const handleFileSelection = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!selectedKB) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (files.length === 1) { uploadMutation.mutate({ kbId: selectedKB.id, file: files[0] }); return; }
    uploadBatchMutation.mutate({ kbId: selectedKB.id, files });
  };

  const isUploading = uploadMutation.isPending || uploadBatchMutation.isPending;
  const docProgress = useMemo(() => {
    const processing = documents.filter((d) => d.status === "processing" || d.status === "pending").length;
    return { total: documents.length, processing, done: documents.filter((d) => d.status === "done").length, error: documents.filter((d) => d.status === "error").length };
  }, [documents]);

  const selectedKBParserConfig = useMemo(() => safeJsonParse(selectedKB?.parser_config_json), [selectedKB?.parser_config_json]);
  const selectedKBRetrievalConfig = useMemo(() => safeJsonParse(selectedKB?.retrieval_config_json), [selectedKB?.retrieval_config_json]);
  const selectedKBPreprocessor = selectedKBParserConfig?.preprocessor === "markitdown" ? "markitdown" : "native";

  useEffect(() => {
    setQuery(""); setQueryResults([]); setQueryError(null); setHasQueried(false); setRewrittenQuery(null); setQueryDebug(null); setFilterFilename("");
    setQueryMinScore(String(selectedKBRetrievalConfig?.min_score ?? 0.2)); setEnableHybridRerank(selectedKBRetrievalConfig?.enable_hybrid_rerank ?? true);
  }, [selectedKB?.id, selectedKBRetrievalConfig?.enable_hybrid_rerank, selectedKBRetrievalConfig?.min_score]);

  return (
    <div className="pt-4 px-6 pb-6 space-y-5">
      <div className="flex items-center justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}><Plus className="h-3.5 w-3.5" />{t("rag.create-kb")}</Button>
      </div>

      {knowledgeBases.length === 0 ? (
        <EmptyState icon={<BookOpen className="h-5 w-5" />} title={t("rag.empty-title")} description={t("rag.empty-description")} action={{ label: t("rag.new-first-kb"), onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="flex gap-4 flex-1 min-h-0">
          {knowledgeBases.length > 1 && (
            <div className="w-64 flex flex-col gap-1.5 overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1">
                {knowledgeBases.map((kb: any) => (
                  <button key={kb.id} type="button" onClick={() => setSelectedKB(kb)}
                    className={`w-full rounded-lg border p-2.5 text-left transition-colors ${selectedKB?.id === kb.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0"><BookOpen className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" /><span className="truncate text-sm font-medium">{kb.name}</span></div>
                      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${knowledgeBaseStatusTone(kb.status)}`} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex-1 flex flex-col gap-3 overflow-hidden">
            {selectedKB ? (
              <>
                <div className="border border-border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-sm">{selectedKB.name}</h2>
                      {selectedKB.description && <p className="text-xs text-muted-foreground mt-0.5">{selectedKB.description}</p>}
                      <div className="flex flex-wrap gap-1 mt-2">
                        <Badge variant="secondary" className="text-[10px] gap-1"><Blocks className="h-3 w-3" />{capabilityOptionLabel(selectedKB.chunk_strategy || "sentence", capabilities?.chunk_strategies, locale)}</Badge>
                        <Badge variant="secondary" className="text-[10px] gap-1"><Database className="h-3 w-3" />{selectedKB.embedding_model_id || t("rag.default-embedding")}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{t("rag.top-k")} {selectedKB.retrieval_top_k}</Badge>
                        <Badge variant="secondary" className="text-[10px]">{t("rag.chunk-size-label")} {selectedKB.chunk_size}</Badge>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <label className={`inline-flex items-center gap-1 h-7 rounded-md border border-input bg-background px-2.5 text-xs font-medium hover:bg-accent cursor-pointer ${isUploading || reindexMutation.isPending ? "opacity-50 pointer-events-none" : ""}`}>
                        <input ref={fileInputRef} type="file" className="hidden" multiple accept=".pdf,.txt,.md,.docx,.html,.csv,.tsv,.json,.xlsx,.pptx" onChange={handleFileSelection} disabled={isUploading || reindexMutation.isPending} />
                        {isUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}{isUploading ? t("rag.uploading") : t("rag.upload-document")}
                      </label>
                      <DropdownMenu>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="h-7 w-7"><MoreHorizontal className="h-3.5 w-3.5" /></Button></DropdownMenuTrigger>
                          </TooltipTrigger>
                          <TooltipContent>Knowledge base actions</TooltipContent>
                        </Tooltip>
                        <DropdownMenuContent align="end" className="w-36">
                          <DropdownMenuItem onClick={() => { setTextTitle(""); setTextContent(""); setShowTextInput(true); }} className="text-xs"><FileEdit className="h-3.5 w-3.5" />{t("rag.input-text")}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => setEditingKB(selectedKB)} className="text-xs"><Pencil className="h-3.5 w-3.5" />{t("rag.edit-config")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => reindexMutation.mutate(selectedKB.id)} className="text-xs"><RefreshCw className="h-3.5 w-3.5" />{t("rag.reindex")}</DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportMutation.mutate(selectedKB.id)} className="text-xs"><Download className="h-3.5 w-3.5" />{t("rag.export-kb")}</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-xs text-destructive" onClick={() => setConfirmDeleteOpen(true)}><Trash2 className="h-3.5 w-3.5" />{t("delete")}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-muted-foreground">
                    <span>{t("rag.docs", { count: selectedKB.doc_count })}</span>
                    <span>{t("rag.index-chunks", { count: selectedKB.chunk_count })}</span>
                  </div>
                </div>

                <div className="grid gap-3 lg:grid-cols-[1.1fr_0.9fr] flex-1 overflow-hidden">
                  <Card className="overflow-hidden flex flex-col">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between gap-2">
                        <CardTitle className="text-sm">{t("rag.document-list")}</CardTitle>
                        <div className="flex gap-1.5 text-[10px] text-muted-foreground">
                          <Badge variant="outline" className="gap-1 text-[10px]"><CheckCircle2 className="h-2.5 w-2.5" />{docProgress.done}</Badge>
                          <Badge variant="outline" className="gap-1 text-[10px]"><AlertCircle className="h-2.5 w-2.5" />{docProgress.error}</Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-1 flex-1 min-h-0 overflow-y-auto">
                      {documents.length === 0 ? <p className="text-sm text-muted-foreground text-center py-8">{t("rag.no-documents")}</p>
                      : documents.map((doc) => (
                        <div key={doc.id} className="group rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center justify-between gap-2">
                          <button type="button" className="flex items-center gap-2 min-w-0 text-left flex-1" onClick={() => previewMutation.mutate({ kbId: selectedKB.id, docId: doc.id })}>
                            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                            <div className="min-w-0">
                              <p className="truncate text-xs font-medium hover:underline">{doc.filename}</p>
                              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-muted-foreground mt-0.5">
                                <span>{documentStatusLabel(doc.status, doc.chunk_count)}</span>
                                {doc.status === "error" && doc.error_msg && <span className="text-destructive/80 line-clamp-1">{compactErrorMessage(doc.error_msg)}</span>}
                              </div>
                            </div>
                          </button>
                          <div className="flex items-center gap-0.5 flex-shrink-0">
                            {doc.status === "error" && <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => retryDocumentMutation.mutate({ kbId: selectedKB.id, docId: doc.id })}><RotateCcw className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Retry</TooltipContent></Tooltip>}
                            <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => deleteDocumentMutation.mutate({ kbId: selectedKB.id, docId: doc.id })}><Trash className="h-3 w-3" /></Button></TooltipTrigger><TooltipContent>Delete document</TooltipContent></Tooltip>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>

                  <TooltipProvider>
                    <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
                      <Card>
                        <CardHeader className="pb-2">
                          <div className="flex items-center gap-1.5">
                            <CardTitle className="text-sm">{t("rag.retrieval-test")}</CardTitle>
                            <Tooltip><TooltipTrigger asChild><HelpCircle className="h-3 w-3 text-muted-foreground" /></TooltipTrigger><TooltipContent side="top" className="max-w-xs"><p className="text-xs">{t("rag.retrieval-test-hint")}</p></TooltipContent></Tooltip>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex gap-1.5">
                            <Input className="h-8 text-sm" value={query} placeholder={t("rag.query-placeholder")} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void handleQuery(); }} />
                            <Button size="sm" className="gap-1" disabled={!query.trim() || queryMutation.isPending} onClick={() => void handleQuery()}>
                              {queryMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}{queryMutation.isPending ? t("rag.searching") : t("search")}
                            </Button>
                          </div>

                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <div className="flex items-center gap-1"><Switch id="hybrid-rerank" checked={enableHybridRerank} onCheckedChange={setEnableHybridRerank} /><label htmlFor="hybrid-rerank" className="text-muted-foreground cursor-pointer">{t("rag.hybrid-rerank")}</label></div>
                            <div className="flex items-center gap-1"><Switch id="rewrite" checked={enableRewrite} onCheckedChange={setEnableRewrite} /><label htmlFor="rewrite" className="text-muted-foreground cursor-pointer">{t("rag.query-rewrite")}</label></div>
                          </div>

                          {rewrittenQuery && <div className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-xs"><span className="font-medium">{t("rag.rewritten")}:</span> {rewrittenQuery}</div>}
                          {queryDebug && <div className="rounded-md border border-border bg-muted/20 px-2.5 py-1.5 text-xs text-muted-foreground">{t("rag.result-stats-detail", { initial: queryDebug.initial_result_count, metadata: queryDebug.metadata_filtered_count, threshold: queryDebug.thresholded_result_count, returned: queryDebug.returned_result_count })}</div>}
                          {queryError && <div className="rounded-md border border-destructive/20 bg-destructive/5 p-2.5 text-xs text-destructive">{queryError}</div>}
                          {queryResults.length > 0 ? (
                            <div className="space-y-1.5">
                              {queryResults.map((result: any, i: number) => (
                                <div key={i} className="rounded-md border border-border bg-muted/20 p-2.5 text-xs">
                                  {result.score != null && <div className="mb-1 text-[10px] text-muted-foreground">Score: {typeof result.score === "number" ? result.score.toFixed(3) : result.score}</div>}
                                  <p className="whitespace-pre-wrap">{result.text}</p>
                                </div>
                              ))}
                            </div>
                          ) : hasQueried ? <div className="rounded-md border border-border bg-muted/20 p-3 text-xs text-muted-foreground">{t("rag.no-query-results")}</div>
                          : <p className="text-xs text-muted-foreground">{t("rag.query-instruction")}</p>}
                        </CardContent>
                      </Card>
                    </div>
                  </TooltipProvider>
                </div>
              </>
            ) : (
              <Card className="flex-1"><CardContent className="h-full flex items-center justify-center"><div className="text-center"><BookOpen className="h-10 w-10 text-muted-foreground mx-auto mb-2" /><p className="text-sm text-muted-foreground">{t("rag.select-kb")}</p></div></CardContent></Card>
            )}
          </div>
        </div>
      )}

      {showCreate && <CreateKBModal capabilities={capabilities} onClose={() => setShowCreate(false)} onSave={(p) => createMutation.mutate(p)} isPending={createMutation.isPending} />}

      {showTextInput && selectedKB && (
        <Dialog open onOpenChange={(open) => !open && setShowTextInput(false)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>{t("rag.input-text-content")}</DialogTitle></DialogHeader>
            <div className="space-y-3 py-1">
              <div className="space-y-1.5"><Label>{t("rag.title")}</Label><Input value={textTitle} onChange={(e) => setTextTitle(e.target.value)} placeholder={t("rag.title-placeholder")} /></div>
              <div className="space-y-1.5"><Label>{t("rag.content")}</Label><Textarea className="min-h-[180px] font-mono text-sm" value={textContent} onChange={(e) => setTextContent(e.target.value)} placeholder={t("rag.content-placeholder")} /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowTextInput(false)}>{t("cancel")}</Button>
              <Button disabled={!textTitle.trim() || !textContent.trim() || uploadTextMutation.isPending} onClick={() => uploadTextMutation.mutate({ kbId: selectedKB.id, title: textTitle.trim(), content: textContent.trim() })}>
                {uploadTextMutation.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}{uploadTextMutation.isPending ? t("rag.importing") : t("rag.import-kb")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {editingKB && <CreateKBModal capabilities={capabilities} knowledgeBase={editingKB} onClose={() => setEditingKB(null)} onSave={(payload) => updateMutation.mutate({ id: editingKB.id, payload, shouldReindex: editingKB.doc_count > 0 })} isPending={updateMutation.isPending} />}

      <ConfirmDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen} title={t("rag.confirm-delete-title")} description={selectedKB ? t("rag.confirm-delete-description", { name: selectedKB.name }) : undefined} confirmText={t("delete")} loading={deleteMutation.isPending} onConfirm={() => { if (!selectedKB) return; deleteMutation.mutate(selectedKB.id); setConfirmDeleteOpen(false); }} />

      <Dialog open={!!previewDocument} onOpenChange={(open) => { if (!open) setPreviewDocument(null); }}>
        <DialogContent className="max-w-4xl max-h-[88vh] overflow-hidden flex flex-col">
          <DialogHeader><DialogTitle className="text-base">{previewDocument?.filename || t("rag.document-preview")}</DialogTitle></DialogHeader>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">{parserModeLabel(previewDocument?.preprocessor, locale)}</Badge>
            <span>{previewDocument?.chunk_count || 0} chunks</span>
          </div>
          <div className="mt-2 flex-1 overflow-auto rounded-lg border border-border bg-muted/20 p-4">
            {previewMutation.isPending ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />{t("rag.loading-preview")}</div>
            : <pre className="whitespace-pre-wrap break-words text-sm leading-6 font-mono">{previewDocument?.preview_text || t("rag.no-preview")}</pre>}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
