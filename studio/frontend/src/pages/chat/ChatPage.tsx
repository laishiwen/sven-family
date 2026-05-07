import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
  createContext,
  useContext,
  type ChangeEvent,
} from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useLocalRuntime,
  AssistantRuntimeProvider,
  ThreadPrimitive,
  ComposerPrimitive,
  MessagePrimitive,
  useMessage,
  useThread,
  type ChatModelAdapter,
} from "@assistant-ui/react";
import {
  chatApi,
  agentsApi,
  modelsApi,
  providersApi,
  obsApi,
  streamChat,
  API_BASE,
  type StreamChunk,
  type ApprovalInfo,
  type ToolCallInfo,
} from "@/lib/api";
import {
  mergeUniqueVoiceChunk,
  useUnifiedSpeechInput,
} from "@/lib/speech-input";
import { cn } from "@/lib/utils";
import { ModelCombobox } from "@/components/ModelCombobox";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Send,
  Square,
  Mic,
  Paperclip,
  Trash2,
  X,
  Bot,
  Cpu,
  User,
  MessageSquare,
  ChevronDown,
  SquarePen,
  PanelLeftClose,
  PanelLeftOpen,
  BrainCircuit,
  Database,
  BookOpen,
  Server,
  Wrench,
  Globe,
  Zap,
  MoreHorizontal,
  Terminal,
  FileText,
  Code2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import i18n from "@/i18n";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { useAppStore } from "@/stores/appStore";
import { useToastStore } from "@/stores/toastStore";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const REASONING_PREVIEW_MARKER = "[[sven-reasoning-preview]]";
const COMPOSER_MAX_CHARS = 4000;

const emptyCapabilityFlags = {
  tool: false,
  mcp: false,
  reasoning: false,
  skills: false,
  rag: false,
};

const parseJsonArray = (value: unknown): unknown[] => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const clampComposerDraft = (value: string): string =>
  value.slice(0, COMPOSER_MAX_CHARS);

const isCanceledRequestError = (error: unknown): boolean => {
  const e = error as { code?: string; name?: string; message?: string };
  return (
    e?.code === "ERR_CANCELED" ||
    e?.name === "CanceledError" ||
    e?.name === "AbortError" ||
    e?.message === "canceled"
  );
};

// ── Context ──────────────────────────────────────────────────────────────────
const CanSendContext = createContext(true);
const IsRespondingContext = createContext(false);
const CapabilityItemsContext = createContext<any[]>([]);
const ToolNamesContext = createContext<Set<string>>(new Set());
const UserIdentityContext = createContext<{
  displayName: string;
  avatarLabel: string;
  avatarUrl: string;
}>({
  displayName: i18n.t("chat.user.default-name"),
  avatarLabel: getAvatarLabel(i18n.t("chat.user.default-name")),
  avatarUrl: "",
});
const AssistantIdentityContext = createContext<{
  displayName: string;
  avatarLabel: string;
}>({
  displayName: "AI",
  avatarLabel: "A",
});
const ChatControlsContext = createContext<{
  reasoningMode: string;
  streamOutput: boolean;
  memoryEnabled: boolean;
  sessionId: string | null;
  toggleReasoning: () => void;
  toggleStream: () => void;
  toggleMemory: () => void;
} | null>(null);

// ── Helpers ───────────────────────────────────────────────────────────────────
function formatSessionTime(
  dateStr: string | undefined,
  locale: string,
  t: TFunction,
): string {
  if (!dateStr) return "";
  const date = parseBackendDate(dateStr);
  if (!date) return "";
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  if (diffDays >= 7) {
    return date.toLocaleDateString(locale, {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  }

  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return t("chat.time.just-now");
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return t("chat.time.minutes-ago", { count: diffMins });
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return t("chat.time.hours-ago", { count: diffHours });
  const days = Math.floor(diffHours / 24);
  return t("chat.time.days-ago", { count: days });
}

function parseBackendDate(dateValue: string | Date | undefined): Date | null {
  if (!dateValue) return null;
  if (dateValue instanceof Date) {
    return Number.isNaN(dateValue.getTime()) ? null : dateValue;
  }

  const raw = String(dateValue).trim();
  if (!raw) return null;

  // If backend string has no timezone suffix, treat it as UTC.
  const hasTimezone = /([zZ]|[+-]\d{2}:?\d{2})$/.test(raw);
  const normalized = hasTimezone ? raw : `${raw}Z`;
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatConversationDate(
  dateStr: string | undefined,
  locale: string,
): string {
  if (!dateStr) return "";
  const date = parseBackendDate(dateStr);
  if (!date) return "";
  return date.toLocaleString(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function formatMessageMetaTime(
  dateValue: string | Date | undefined,
  locale: string,
): string {
  const date = parseBackendDate(dateValue);
  if (!date) return "";

  return date.toLocaleTimeString(locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Rough token estimation: ~1 token per 3 characters (covers English + Chinese mixed content).
 * English words average ~4 chars/token; Chinese chars average ~1.5 chars/token.
 */
function estimateTokens(text: string): number {
  return Math.max(1, Math.round(text.length / 3));
}

function getAvatarLabel(name: string | undefined): string {
  const normalized = String(name || "AI").trim();
  if (!normalized) return "A";
  const match = normalized.match(/[A-Za-z0-9\u4e00-\u9fff]/u);
  return (match?.[0] || "A").toUpperCase();
}

function getMessageTimestamp(message: any): string | Date | undefined {
  return message?.metadata?.custom?.timestamp || message?.createdAt;
}

function formatMessageGroupTime(
  dateValue: string | Date | undefined,
  t: TFunction,
): string {
  const date = parseBackendDate(dateValue);
  if (!date) return "";

  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  const pad2 = (n: number) => String(n).padStart(2, "0");
  const hhmm = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;

  if (sameDay(date, now)) {
    return t("chat.message-group.today", { time: hhmm });
  }

  if (sameDay(date, yesterday)) {
    return t("chat.message-group.yesterday", { time: hhmm });
  }

  return `${date.getFullYear()}/${pad2(date.getMonth() + 1)}/${pad2(date.getDate())} ${hhmm}`;
}

function MessageTimeDivider() {
  const { t } = useTranslation();
  const messageId = useMessage((state) => String((state as any).id ?? ""));
  const messageCreatedAt = useMessage(
    (state) => (state as any).createdAt as string | Date | undefined,
  );
  const messageTimestamp = useMessage(
    (state) =>
      (
        (state as any).metadata as
          | { custom?: { timestamp?: string } }
          | undefined
      )?.custom?.timestamp,
  );
  const messages = useThread((state) => state.messages as any[]);

  const currentIndex = messages.findIndex(
    (message) => String(message?.id ?? "") === messageId,
  );
  const previousMessage = currentIndex > 0 ? messages[currentIndex - 1] : null;

  const currentTimestamp = messageTimestamp || messageCreatedAt;
  const previousTimestamp =
    previousMessage?.metadata?.custom?.timestamp || previousMessage?.createdAt;

  const currentDate = parseBackendDate(currentTimestamp);
  const previousDate = parseBackendDate(previousTimestamp);

  const shouldShow =
    !!currentDate &&
    !Number.isNaN(currentDate.getTime()) &&
    (!previousDate ||
      Number.isNaN(previousDate.getTime()) ||
      currentDate.getTime() - previousDate.getTime() > 5 * 60 * 1000);

  if (!shouldShow || !currentDate) return null;

  return (
    <div className="mb-3 flex justify-center">
      <div className="rounded-full bg-muted/15 px-3 py-1 text-[10px] font-normal tracking-[0.01em] text-muted-foreground/60">
        {formatMessageGroupTime(currentDate, t)}
      </div>
    </div>
  );
}

// ── Session Sidebar Item ──────────────────────────────────────────────────────
function SessionItem({
  session,
  active,
  onClick,
  onDelete,
  models,
  agents,
}: any) {
  const { t, i18n } = useTranslation();
  const timeStr = formatSessionTime(
    session.updated_at || session.created_at,
    i18n.language,
    t,
  );
  const model = (models || []).find((m: any) => m.id === session.model_id);
  const agent = (agents || []).find((a: any) => a.id === session.agent_id);
  return (
    <div
      className={cn(
        "group flex items-start gap-2 px-2.5 py-2 rounded-md cursor-pointer transition-colors text-sm border-l-[3px] border-transparent",
        active
          ? "bg-amber-50/50 dark:bg-amber-950/20 border-l-amber-500 text-foreground font-medium"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-1">
          <span className="truncate font-medium text-foreground text-xs leading-snug">
            {session.title || t("new-chat")}
          </span>
          {timeStr && (
            <span className="text-[10px] text-muted-foreground flex-shrink-0">
              {timeStr}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 mt-0.5">
          {session.mode === "agent" && agent ? (
            <span className="text-[10px] text-muted-foreground bg-muted/30 rounded px-1 truncate max-w-[120px]">
              <Bot className="w-2.5 h-2.5 inline mr-0.5" />
              {agent.name}
            </span>
          ) : model ? (
            <span className="text-[10px] text-muted-foreground bg-muted/30 rounded px-1 truncate max-w-[120px]">
              <Cpu className="w-2.5 h-2.5 inline mr-0.5" />
              {model.name}
            </span>
          ) : null}
        </div>
        {session.last_message_preview && (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-snug">
            {session.last_message_preview}
          </p>
        )}
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="opacity-0 group-hover:opacity-100 transition-opacity h-5 w-5 flex-shrink-0"
            onClick={(e) => e.stopPropagation()}
            title="Session options"
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(session.id);
            }}
          >
            <Trash2 className="w-3.5 h-3.5 mr-2" />
            {t("delete")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// ── User Message ──────────────────────────────────────────────────────────────
function UserMessage() {
  const { i18n } = useTranslation();
  const userIdentity = useContext(UserIdentityContext);
  const messageTimestamp = useMessage((state) => getMessageTimestamp(state));
  const messageText = useMessage((state) =>
    (state.content ?? [])
      .filter((part: any) => part.type === "text")
      .map((part: any) => String(part.text ?? ""))
      .join(""),
  );
  const tokenCount = estimateTokens(messageText);

  return (
    <>
      <MessageTimeDivider />
      <MessagePrimitive.Root className="mb-4 flex flex-row-reverse items-start gap-3">
        <Avatar className="h-9 w-9 flex-shrink-0 rounded-lg border border-border bg-secondary">
          <AvatarImage
            src={userIdentity.avatarUrl}
            alt={userIdentity.displayName}
          />
          <AvatarFallback className="rounded-lg bg-secondary text-secondary-foreground text-sm font-semibold">
            {userIdentity.avatarLabel}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 max-w-[82%] sm:max-w-[68%]">
          <div className="w-full rounded-2xl px-4 py-2.5 text-sm text-foreground">
            <MessagePrimitive.Content />
          </div>
          {messageText.trim().length > 0 && (
            <div className="mt-1 flex items-center justify-end gap-2">
              <span className="text-[10px] leading-4 text-muted-foreground/70">
                {formatMessageMetaTime(messageTimestamp, i18n.language)}
              </span>
              <span className="text-[10px] leading-4 text-muted-foreground/50">
                ~{tokenCount} tokens
              </span>
            </div>
          )}
        </div>
      </MessagePrimitive.Root>
    </>
  );
}

// ── Assistant Message ─────────────────────────────────────────────────────────
function AssistantMessage() {
  const { t, i18n } = useTranslation();
  const assistantIdentity = useContext(AssistantIdentityContext);
  const toolNames = useContext(ToolNamesContext);
  const textContent = useMessage((state) =>
    (state.content ?? [])
      .filter((part: any) => part.type === "text")
      .map((part: any) => String(part.text ?? ""))
      .join(""),
  );
  const hasRenderableContent = useMessage((state) =>
    (state.content ?? []).some((part: any) => {
      if (part.type !== "text") return true;
      return String(part.text ?? "").trim().length > 0;
    }),
  );
  const messageTimestamp = useMessage((state) => getMessageTimestamp(state));

  // When a request is aborted, assistant-ui may leave an empty assistant message.
  // Hide empty assistant bubbles so the UI does not show a blank message row.
  if (!hasRenderableContent) return null;

  const isReasoningPreview = textContent.startsWith(REASONING_PREVIEW_MARKER);
  const reasoningPreviewBody = isReasoningPreview
    ? textContent.slice(REASONING_PREVIEW_MARKER.length)
    : "";
  const reasoningPreviewLines = reasoningPreviewBody
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .slice(-3);
  while (reasoningPreviewLines.length < 3) {
    reasoningPreviewLines.unshift("");
  }

  const toolIconMap: Record<string, any> = {
    "Web Search": Globe,
    "File I/O": FileText,
    "System CLI": Terminal,
  };

  return (
    <>
      <MessageTimeDivider />
      <MessagePrimitive.Root className="mb-4 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-semibold text-foreground">
          {assistantIdentity.avatarLabel}
        </div>
        <div className="min-w-0 max-w-[82%] sm:max-w-[68%]">
          {toolNames && toolNames.size > 0 && !isReasoningPreview && (
            <div className="flex items-center gap-1 mb-1.5">
              {[...toolNames].map((name) => {
                const Icon = toolIconMap[name] || Wrench;
                return (
                  <Tooltip key={name}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center justify-center h-5 w-5 rounded bg-muted/50 text-muted-foreground cursor-default">
                        <Icon className="w-3 h-3" />
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="text-xs">
                      {name}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </div>
          )}
          <div
            className={cn(
              "rounded-2xl px-4 py-2.5 text-sm text-foreground",
              isReasoningPreview ? "w-[50%] max-w-[50%]" : "w-full",
            )}
          >
            {isReasoningPreview ? (
              <div className="h-[104px] overflow-hidden">
                <div className="h-5 text-xs font-medium text-muted-foreground">
                  {t("chat.reasoning.in-progress")}
                </div>
                <div className="mt-1 space-y-1">
                  {reasoningPreviewLines.map((line, index) => (
                    <div
                      key={index}
                      className="h-5 overflow-hidden whitespace-pre-wrap break-all text-sm leading-5 text-card-foreground"
                    >
                      {line || "\u00A0"}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <MessagePrimitive.Content />
            )}
          </div>
          {!isReasoningPreview && textContent.trim().length > 0 && (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] leading-4 text-muted-foreground/70">
                {formatMessageMetaTime(messageTimestamp, i18n.language)}
              </span>
              <span className="text-[10px] leading-4 text-muted-foreground/50">
                ~{estimateTokens(textContent)} tokens
              </span>
            </div>
          )}
        </div>
      </MessagePrimitive.Root>
    </>
  );
}

// ── Composer ─────────────────────────────────────────────────────────────────
function Composer() {
  const { t } = useTranslation();
  const addToast = useToastStore((s) => s.addToast);
  const canSend = useContext(CanSendContext);
  const isResponding = useContext(IsRespondingContext);
  const chatControls = useContext(ChatControlsContext);
  const [draft, setDraft] = useState("");
  const [isInputFocused, setIsInputFocused] = useState(false);
  const [apiDialogOpen, setApiDialogOpen] = useState(false);
  const rootRef = useRef<HTMLFormElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Snapshot of draft text at the moment recording starts.
  // Voice results are appended after this baseline so pre-existing text is
  // never overwritten by transcription updates.
  const preSpeechDraftRef = useRef("");

  const {
    state: voiceState,
    start,
    stop,
  } = useUnifiedSpeechInput({
    onText: (text, mode) => {
      if (mode === "replace") {
        // Desktop cumulative-replace: only update the speech portion, keep
        // whatever the user had typed before pressing the mic button.
        const base = preSpeechDraftRef.current;
        const joined = base ? `${base} ${text}` : text;
        setDraft(clampComposerDraft(joined));
        return;
      }
      setDraft((prev) => clampComposerDraft(mergeUniqueVoiceChunk(prev, text)));
    },
    onError: (message) => {
      addToast({ type: "error", message });
    },
  });

  const startVoiceCapture = useCallback(async () => {
    if (isResponding || voiceState.isRecording) return;
    // Capture current draft as the immutable baseline before speech starts.
    setDraft((current) => {
      preSpeechDraftRef.current = current.trimEnd();
      return current;
    });
    try {
      await start();
    } catch {
      // errors are surfaced by onError callback
    }
  }, [isResponding, start, voiceState.isRecording]);

  const toggleVoice = useCallback(() => {
    if (voiceState.isRecording) {
      preSpeechDraftRef.current = "";
      stop();
      return;
    }
    void startVoiceCapture();
  }, [startVoiceCapture, stop, voiceState.isRecording]);

  const openAttachmentPicker = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleAttachmentChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files || []);
      if (files.length === 0) return;

      const attachedNames = files.map((file) => `[${file.name}]`).join(" ");
      setDraft((prev) =>
        clampComposerDraft(prev ? `${prev}\n${attachedNames}` : attachedNames),
      );
      addToast({
        type: "success",
        message: t("chat.attachment.selected", { count: files.length }),
      });
      event.target.value = "";
    },
    [addToast, t],
  );

  const handleTranslateClick = useCallback(() => {
    addToast({ type: "info", message: t("chat.translate.pending") });
  }, [addToast, t]);

  const resolvedSessionId = chatControls?.sessionId ?? "<session_id>";
  const messageApiPath = `/api/v1/chat/sessions/${resolvedSessionId}/messages`;
  const streamApiPath = `/api/v1/chat/sessions/${resolvedSessionId}/messages/stream`;
  const curlSnippet = `curl -X POST "${API_BASE}${messageApiPath}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "content": "Hello",
    "agent_id": "<agent_id>",
    "model_id": "<model_id>",
    "stream_output": false
  }'`;

  const canSubmit = !isResponding && canSend && draft.trim().length > 0;
  const shouldShowClear = isInputFocused && draft.length > 0;
  return (
    <ComposerPrimitive.Root
      ref={rootRef}
      className="bg-background px-4 pb-3 pt-2"
      onSubmitCapture={() => {
        if (!canSend && draft.trim()) {
          addToast({
            type: "warning",
            message: t("chat.select-model-or-agent"),
          });
          return;
        }
        setDraft("");
      }}
    >
      <div className="w-full">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-background transition-all duration-200 focus-within:border-amber-500/70 focus-within:shadow-[0_0_0_3px_rgba(217,119,6,0.12)]">
          <ComposerPrimitive.Input
            className="w-full resize-none border-0 bg-transparent px-4 pb-2 pt-3 pr-12 text-sm min-h-[48px] max-h-[calc(50vh-52px)] placeholder:text-muted-foreground outline-none"
            placeholder={t("chat.input.placeholder")}
            value={draft}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            onChange={(e) =>
              setDraft(clampComposerDraft(e.currentTarget.value))
            }
            onKeyDown={(e) => {
              if (!canSubmit && e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                if (!canSend && draft.trim()) {
                  addToast({
                    type: "warning",
                    message: t("chat.select-model-or-agent"),
                  });
                }
              }
            }}
          />

          {shouldShowClear && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-2 top-2 h-7 w-7 rounded-md text-muted-foreground hover:text-foreground"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setDraft("")}
              aria-label={t("chat.input.clear")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}

          <div className="flex h-11 items-center justify-between border-t border-border px-2">
            <div className="flex items-center gap-1">
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                onChange={handleAttachmentChange}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    onClick={openAttachmentPicker}
                    aria-label={t("chat.attachment.upload")}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("chat.attachment.upload")}</TooltipContent>
              </Tooltip>

              {chatControls && (
                <>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 rounded-lg"
                        onClick={() => setApiDialogOpen(true)}
                        aria-label={t("chat.api.access")}
                      >
                        <Code2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>{t("chat.api.access")}</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8 rounded-lg",
                          chatControls.memoryEnabled &&
                            "bg-violet-50 text-violet-600 hover:bg-violet-100 dark:bg-violet-950/40 dark:text-violet-400",
                        )}
                        onClick={chatControls.toggleMemory}
                      >
                        <Database className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {chatControls.memoryEnabled
                        ? t("chat.memory.enabled")
                        : t("chat.memory.disabled")}
                    </TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8 rounded-lg",
                          chatControls.reasoningMode === "deep" &&
                            "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400",
                        )}
                        onClick={chatControls.toggleReasoning}
                      >
                        <BrainCircuit className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {chatControls.reasoningMode === "deep"
                        ? t("chat.reasoning.enabled")
                        : t("chat.reasoning.enable")}
                    </TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className={cn(
                          "h-8 w-8 rounded-lg",
                          chatControls.streamOutput &&
                            "bg-amber-50 text-amber-600 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-400",
                        )}
                        onClick={chatControls.toggleStream}
                      >
                        <Zap className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {chatControls.streamOutput
                        ? t("chat.stream.enabled")
                        : t("chat.stream.enable")}
                    </TooltipContent>
                  </Tooltip>

                  <Dialog open={apiDialogOpen} onOpenChange={setApiDialogOpen}>
                    <DialogContent className="max-w-[720px]">
                      <DialogHeader>
                        <DialogTitle>{t("chat.api.title")}</DialogTitle>
                        <DialogDescription>
                          {t("chat.api.description")}
                        </DialogDescription>
                      </DialogHeader>

                      <div className="space-y-3 text-sm">
                        <div>
                          <div className="mb-1 font-medium text-foreground">
                            {t("chat.api.base-url")}
                          </div>
                          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
                            {`${API_BASE}/api/v1`}
                          </pre>
                        </div>

                        <div>
                          <div className="mb-1 font-medium text-foreground">
                            {t("chat.api.single-endpoint")}
                          </div>
                          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
                            {messageApiPath}
                          </pre>
                        </div>

                        <div>
                          <div className="mb-1 font-medium text-foreground">
                            {t("chat.api.stream-endpoint")}
                          </div>
                          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
                            {streamApiPath}
                          </pre>
                        </div>

                        <div>
                          <div className="mb-1 font-medium text-foreground">
                            {t("chat.api.example")}
                          </div>
                          <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-2 text-xs leading-relaxed">
                            {curlSnippet}
                          </pre>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <span className="min-w-[72px] text-right text-[11px] text-muted-foreground">
                {draft.length}/{COMPOSER_MAX_CHARS}
              </span>

              {isResponding ? (
                <ComposerPrimitive.Cancel asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    aria-label={t("chat.abort")}
                  >
                    <Square className="h-4 w-4" />
                  </Button>
                </ComposerPrimitive.Cancel>
              ) : voiceState.isRecording || !draft.trim() ? (
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className={cn(
                    "h-8 w-8 rounded-lg relative overflow-visible transition-all duration-200",
                    voiceState.isRecording
                      ? "border-red-200 bg-red-50 text-red-600 hover:bg-red-100"
                      : "",
                  )}
                  onClick={toggleVoice}
                  aria-label={
                    voiceState.isRecording
                      ? t("chat.voice.stop")
                      : t("chat.voice.start")
                  }
                  title={
                    voiceState.isRecording
                      ? t("chat.voice.stop")
                      : voiceState.ready
                        ? t("chat.voice.start")
                        : t("chat.voice.preparing")
                  }
                >
                  {voiceState.isRecording && voiceState.isSpeaking ? (
                    <>
                      <span
                        className="absolute inset-0 rounded-lg bg-red-400/10 animate-pulse"
                        style={{
                          transform: `scale(${1 + Math.min(voiceState.voiceLevel * 0.18, 0.18)})`,
                        }}
                      />
                      <span
                        className="absolute inset-0 rounded-lg border border-red-300/60"
                        style={{
                          transform: `scale(${1 + Math.min(voiceState.voiceLevel * 0.3, 0.3)})`,
                        }}
                      />
                    </>
                  ) : null}
                  <Mic
                    className={cn(
                      "h-4 w-4 transition-transform duration-100",
                      voiceState.isRecording &&
                        voiceState.isSpeaking &&
                        "animate-pulse",
                    )}
                    style={{
                      transform:
                        voiceState.isRecording && voiceState.isSpeaking
                          ? `scale(${1 + Math.min(voiceState.voiceLevel * 0.35, 0.35)})`
                          : "scale(1)",
                    }}
                  />
                  {voiceState.isRecording ? (
                    <span
                      className="absolute -right-1 -top-1 block h-2.5 w-2.5 rounded-full bg-red-500"
                      style={{
                        opacity: voiceState.isSpeaking
                          ? 0.6 + Math.min(voiceState.voiceLevel, 0.35)
                          : 0.35,
                      }}
                    />
                  ) : null}
                </Button>
              ) : (
                <ComposerPrimitive.Send asChild>
                  <Button
                    variant={canSubmit ? "default" : "secondary"}
                    size="icon"
                    className="h-8 w-8 rounded-lg"
                    disabled={!canSubmit}
                    aria-label={t("send-message")}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </ComposerPrimitive.Send>
              )}
            </div>
          </div>
        </div>
      </div>
    </ComposerPrimitive.Root>
  );
}

// ── System Message (agent config card) ────────────────────────────────────────
function SystemMessage() {
  const { t } = useTranslation();
  const textContent = useMessage((state) =>
    (state.content ?? [])
      .filter((part: any) => part.type === "text")
      .map((part: any) => String(part.text ?? ""))
      .join(""),
  );

  if (!textContent.trim()) return null;

  return (
    <MessagePrimitive.Root className="mb-4 flex justify-center">
      <div className="w-full max-w-3xl rounded-xl border border-amber-200/60 bg-amber-50/40 dark:border-amber-900/30 dark:bg-amber-950/10 px-4 py-3">
        <div className="flex items-center gap-2 mb-2">
          <div className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-100 dark:bg-amber-900/30">
            <Bot className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
            {t("agents.system-prompt")}
          </span>
        </div>
        <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed line-clamp-6">
          {textContent}
        </p>
      </div>
    </MessagePrimitive.Root>
  );
}

// ── Thread ────────────────────────────────────────────────────────────────────
function Thread() {
  const { t, i18n } = useTranslation();
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [showTransientScrollbar, setShowTransientScrollbar] = useState(false);
  const [hasScrollableContent, setHasScrollableContent] = useState(false);
  const isResponding = useContext(IsRespondingContext);
  const assistantIdentity = useContext(AssistantIdentityContext);
  const capabilityItems = useContext(CapabilityItemsContext);
  const messageCount = useThread((state) => (state.messages ?? []).length);
  const hasRunningAssistantOutput = useThread((state) => {
    const messages = (state.messages ?? []) as any[];
    return messages.some((message) => {
      if (message?.role !== "assistant") return false;
      if (message?.status?.type !== "running") return false;
      const parts = Array.isArray(message?.content) ? message.content : [];
      return parts.some((part: any) => {
        if (part?.type !== "text") return true;
        return String(part?.text ?? "").trim().length > 0;
      });
    });
  });
  const viewportRef = useRef<HTMLDivElement>(null);
  const hideScrollbarTimerRef = useRef<number | null>(null);

  const updateScrollableState = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const scrollable = el.scrollHeight > el.clientHeight + 1;
    setHasScrollableContent(scrollable);
    if (!scrollable) {
      setShowTransientScrollbar(false);
    }
  }, []);

  const scheduleHideScrollbar = useCallback(() => {
    if (hideScrollbarTimerRef.current) {
      window.clearTimeout(hideScrollbarTimerRef.current);
    }
    hideScrollbarTimerRef.current = window.setTimeout(() => {
      setShowTransientScrollbar(false);
      hideScrollbarTimerRef.current = null;
    }, 2000);
  }, []);

  const handleScroll = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    updateScrollableState();
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // Only show button when scrolled more than one full viewport height from bottom
    setShowScrollBtn(distFromBottom > el.clientHeight);
    if (el.scrollHeight > el.clientHeight + 1) {
      setShowTransientScrollbar(true);
      scheduleHideScrollbar();
    }
  }, [scheduleHideScrollbar, updateScrollableState]);

  useEffect(() => {
    updateScrollableState();
  }, [
    messageCount,
    isResponding,
    capabilityItems.length,
    updateScrollableState,
  ]);

  useEffect(() => {
    return () => {
      if (hideScrollbarTimerRef.current) {
        window.clearTimeout(hideScrollbarTimerRef.current);
      }
    };
  }, []);

  const handleScrollToBottom = useCallback(() => {
    const el = viewportRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <ThreadPrimitive.Viewport
        ref={viewportRef}
        onScroll={handleScroll}
        className={cn(
          "flex-1 overflow-y-scroll px-6 py-4 chat-scrollbar",
          showTransientScrollbar &&
            hasScrollableContent &&
            "chat-scrollbar--active",
        )}
      >
        <ThreadPrimitive.Empty>
          <div className="flex h-full flex-col items-center justify-center text-muted-foreground py-16">
            <Bot className="w-8 h-8 mb-4 opacity-20" />
            <p className="text-base font-normal font-serif">
              {t("chat.empty.title")}
            </p>
            <p className="text-sm mt-1 opacity-50">
              {t("chat.empty.description")}
            </p>
          </div>
        </ThreadPrimitive.Empty>
        <ThreadPrimitive.Messages
          components={{ UserMessage, AssistantMessage, SystemMessage }}
        />
        {isResponding && !hasRunningAssistantOutput ? (
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted text-lg font-semibold text-foreground">
              {assistantIdentity.avatarLabel}
            </div>
            <div className="min-w-0 max-w-[82%] sm:max-w-[68%]">
              <div className="mb-2 flex min-w-0 flex-col">
                <span className="truncate text-sm font-medium leading-5 text-foreground">
                  {assistantIdentity.displayName}
                </span>
                <span className="text-[10px] leading-4 text-muted-foreground/70">
                  {formatMessageMetaTime(new Date(), i18n.language)}
                </span>
              </div>
              <div className="inline-flex w-full items-center gap-2 rounded-2xl rounded-tl-md border border-border bg-card px-4 py-2.5 text-sm text-muted-foreground">
                <span>{t("chat.generating")}</span>
                <span
                  className="inline-flex items-center gap-1"
                  aria-label={t("loading")}
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse" />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse"
                    style={{ animationDelay: "0.2s" }}
                  />
                  <span
                    className="h-1.5 w-1.5 rounded-full bg-muted-foreground/40 animate-pulse"
                    style={{ animationDelay: "0.4s" }}
                  />
                </span>
              </div>
            </div>
          </div>
        ) : null}
      </ThreadPrimitive.Viewport>
      {showScrollBtn && (
        <div className="flex justify-center pb-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 rounded-full"
            onClick={handleScrollToBottom}
          >
            <ChevronDown className="w-3 h-3 mr-1" />
            {t("chat.scroll-bottom")}
          </Button>
        </div>
      )}
      <Composer />
    </div>
  );
}

// ── Chat Session View ─────────────────────────────────────────────────────────
interface SessionViewProps {
  sessionId: string | null;
  mode: "model" | "agent";
  modelId: string;
  agentId: string;
  reasoningMode: string;
  streamOutput: boolean;
  onSessionCreated: (id: string) => void;
  onRespondingChange: (value: boolean) => void;
  onApproval: (info: ApprovalInfo, sessionId: string) => void;
  onStreamingChange?: (isStreaming: boolean) => void;
  onToolCall?: (info: ToolCallInfo) => void;
  initialMessages: any[];
  initialSystemMessage?: string | null;
  visible?: boolean;
}

function ChatSessionView({
  sessionId,
  mode,
  modelId,
  agentId,
  reasoningMode,
  streamOutput,
  onSessionCreated,
  onRespondingChange,
  onApproval,
  onStreamingChange,
  onToolCall,
  initialMessages,
  initialSystemMessage,
  visible = true,
}: SessionViewProps) {
  const { t } = useTranslation();
  const sessionIdRef = useRef(sessionId);
  const modeRef = useRef(mode);
  const modelIdRef = useRef(modelId);
  const agentIdRef = useRef(agentId);
  const reasoningModeRef = useRef(reasoningMode);
  const streamOutputRef = useRef(streamOutput);
  const onCreatedRef = useRef(onSessionCreated);
  const onRespondingRef = useRef(onRespondingChange);
  const onApprovalRef = useRef(onApproval);
  const onStreamingRef = useRef(onStreamingChange);
  const onToolCallRef = useRef(onToolCall);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);
  useEffect(() => {
    modelIdRef.current = modelId;
  }, [modelId]);
  useEffect(() => {
    agentIdRef.current = agentId;
  }, [agentId]);
  useEffect(() => {
    reasoningModeRef.current = reasoningMode;
  }, [reasoningMode]);
  useEffect(() => {
    streamOutputRef.current = streamOutput;
  }, [streamOutput]);
  useEffect(() => {
    onCreatedRef.current = onSessionCreated;
  }, [onSessionCreated]);
  useEffect(() => {
    onRespondingRef.current = onRespondingChange;
  }, [onRespondingChange]);
  useEffect(() => {
    onApprovalRef.current = onApproval;
  }, [onApproval]);
  useEffect(() => {
    onStreamingRef.current = onStreamingChange;
  }, [onStreamingChange]);
  useEffect(() => {
    onToolCallRef.current = onToolCall;
  }, [onToolCall]);

  const adapterRef = useRef<ChatModelAdapter>({
    async *run({ messages, abortSignal }) {
      onRespondingRef.current(true);
      onStreamingRef.current?.(true);
      setActiveToolNames(new Set());
      try {
        let sid = sessionIdRef.current;
        let isNewSession = false;
        if (!sid) {
          const body: any = { title: t("new-chat"), mode: modeRef.current };
          if (modeRef.current === "model" && modelIdRef.current)
            body.model_id = modelIdRef.current;
          if (modeRef.current === "agent" && agentIdRef.current)
            body.agent_id = agentIdRef.current;
          body.reasoning_mode = reasoningModeRef.current;
          body.stream_output = streamOutputRef.current;
          body.memory_enabled = modeRef.current === "agent";
          body.search_enabled = false;
          body.search_provider = null;
          const res = await chatApi.createSession(body);
          sid = res.data.id;
          // Update the ref immediately so subsequent messages use the right session
          sessionIdRef.current = sid;
          isNewSession = true;
        }

        const lastMsg = messages[messages.length - 1];
        const userText =
          lastMsg?.content
            ?.filter((c: any) => c.type === "text")
            .map((c: any) => c.text)
            .join("") ?? "";

        if (streamOutputRef.current) {
          const chunks: StreamChunk[] = [];
          let done = false;
          let error: string | null = null;
          let renderedReasoning = "";
          let renderedAnswer = "";
          let pendingReasoning = "";
          let pendingAnswer = "";
          let lastEmitTs = 0;
          let hasEmittedFirst = false; // Track if we've yielded at least once

          let approvalFired = false;

          const handle = streamChat(
            sid as string,
            userText,
            reasoningModeRef.current === "deep",
            (chunk) => {
              chunks.push(chunk);
            },
            (doneRunId) => {
              done = true;
            },
            (err) => {
              error = err;
              done = true;
            },
            (info) => {
              approvalFired = true;
              handle.abort();
              onApprovalRef.current(info, sid as string);
            },
            (tc) => {
              setActiveToolNames((prev) => new Set(prev).add(tc.name));
              onToolCallRef.current?.(tc);
            },
          );

          const abortHandler = () => {
            handle.abort();
            done = true;
          };
          abortSignal?.addEventListener("abort", abortHandler);

          if (approvalFired) {
            abortSignal?.removeEventListener("abort", abortHandler);
            return;
          }

          while (!done && !abortSignal?.aborted) {
            while (chunks.length > 0) {
              const incoming = chunks.shift();
              if (!incoming) continue;

              if (incoming.kind === "reasoning") {
                pendingReasoning += incoming.text;
              } else {
                pendingAnswer += incoming.text;
              }
            }

            const now = Date.now();
            const shouldEmit = now - lastEmitTs >= 16;
            const hasPending =
              pendingReasoning.length > 0 || pendingAnswer.length > 0;
            if (shouldEmit && hasPending) {
              if (pendingAnswer.length > 0) {
                const step = Math.min(2, pendingAnswer.length);
                renderedAnswer += pendingAnswer.slice(0, step);
                pendingAnswer = pendingAnswer.slice(step);
              } else if (pendingReasoning.length > 0) {
                const step = Math.min(2, pendingReasoning.length);
                renderedReasoning += pendingReasoning.slice(0, step);
                pendingReasoning = pendingReasoning.slice(step);
              }

              lastEmitTs = now;
              hasEmittedFirst = true;
              const previewText = renderedAnswer
                ? renderedAnswer
                : `${REASONING_PREVIEW_MARKER}${renderedReasoning}`;
              yield { content: [{ type: "text" as const, text: previewText }] };
            }

            await sleep(16);
          }

          // If aborted before any content was emitted, exit early (don't create empty message)
          if (abortSignal?.aborted && !hasEmittedFirst) {
            abortSignal.removeEventListener("abort", abortHandler);
            return;
          }

          while (chunks.length > 0) {
            const incoming = chunks.shift();
            if (!incoming) continue;
            if (incoming.kind === "reasoning") {
              pendingReasoning += incoming.text;
            } else {
              pendingAnswer += incoming.text;
            }
          }

          while (pendingReasoning.length > 0 || pendingAnswer.length > 0) {
            if (pendingAnswer.length > 0) {
              const step = Math.min(6, pendingAnswer.length);
              renderedAnswer += pendingAnswer.slice(0, step);
              pendingAnswer = pendingAnswer.slice(step);
            } else if (pendingReasoning.length > 0) {
              const step = Math.min(6, pendingReasoning.length);
              renderedReasoning += pendingReasoning.slice(0, step);
              pendingReasoning = pendingReasoning.slice(step);
            }

            const previewText = renderedAnswer
              ? renderedAnswer
              : `${REASONING_PREVIEW_MARKER}${renderedReasoning}`;
            yield { content: [{ type: "text" as const, text: previewText }] };
            await sleep(10);
          }

          abortSignal?.removeEventListener("abort", abortHandler);

          if (error) throw new Error(error);
          if (isNewSession) {
            onCreatedRef.current(sid as string);
          }
          return;
        }

        let response;
        try {
          response = await chatApi.sendMessage(
            sid as string,
            userText,
            reasoningModeRef.current === "deep",
            abortSignal,
          );
        } catch (error) {
          if (abortSignal?.aborted || isCanceledRequestError(error)) {
            return;
          }
          throw error;
        }

        if (abortSignal?.aborted) {
          return;
        }

        // Handle HITL approval in non-streaming mode
        if (response.data?.type === "approval_required") {
          onApprovalRef.current(
            {
              run_id: response.data.run_id,
              action: response.data.action,
              target: response.data.target,
              arguments: response.data.arguments || {},
              label: response.data.label || "",
            },
            sid as string,
          );
          yield { content: [{ type: "text" as const, text: "" }] };
          return;
        }

        const finalText = response.data?.message || "";
        yield { content: [{ type: "text" as const, text: finalText }] };
        if (isNewSession) {
          onCreatedRef.current(sid as string);
        }
      } finally {
        onRespondingRef.current(false);
        onStreamingRef.current?.(false);
      }
    },
  });

  const mappedInitial = useMemo(() => {
    const msgs = initialMessages.map((m: any) => ({
      id: m.id,
      role: m.role as "user" | "assistant",
      content: [{ type: "text" as const, text: m.content || "" }],
      metadata: { custom: { timestamp: m.created_at } },
      createdAt: parseBackendDate(m.created_at) || undefined,
    }));
    // Prepend agent system prompt as fixed first message
    if (initialSystemMessage && msgs.length === 0) {
      msgs.unshift({
        id: "__system_prompt__",
        role: "system" as const,
        content: [{ type: "text" as const, text: initialSystemMessage }],
        createdAt: new Date(),
      } as any);
    }
    return msgs;
  }, [initialMessages, initialSystemMessage]);

  const runtime = useLocalRuntime(adapterRef.current, {
    initialMessages: mappedInitial,
  });

  // Track tool names used in current response for UI badges
  const [activeToolNames, setActiveToolNames] = useState<Set<string>>(
    new Set(),
  );
  const toolNamesRef = useRef(activeToolNames);
  toolNamesRef.current = activeToolNames;

  // Stabilize <Thread /> element to prevent React.memo on AssistantRuntimeProvider
  // from failing every render (which caused store reset → flicker).
  const threadElement = useMemo(() => <Thread />, []);

  return (
    <ToolNamesContext.Provider value={activeToolNames}>
      <AssistantRuntimeProvider runtime={runtime}>
        {threadElement}
      </AssistantRuntimeProvider>
    </ToolNamesContext.Provider>
  );
}

// ── Main ChatPage ─────────────────────────────────────────────────────────────
export default function ChatPage() {
  const { t } = useTranslation();
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const qc = useQueryClient();

  const [mode, setMode] = useState<"model" | "agent">("model");
  const [selectedModelId, setSelectedModelId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showSidebarTransientScrollbar, setShowSidebarTransientScrollbar] =
    useState(false);
  const sidebarScrollbarTimerRef = useRef<number | null>(null);
  const [reasoningMode, setReasoningMode] = useState("standard");
  const [streamOutput, setStreamOutput] = useState(true);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [isResponding, setIsResponding] = useState(false);

  // Detect interrupted runs when loading a session
  const interruptedQuery = useQuery({
    queryKey: ["chat-interrupted", urlSessionId],
    queryFn: async () => {
      if (!urlSessionId) return false;
      const runs = await chatApi.listRuns(urlSessionId).then((r) => r.data || []);
      return runs[0]?.status === "interrupted" || runs[0]?.status === "cancelled";
    },
    enabled: !!urlSessionId,
    refetchOnMount: true,
    staleTime: 10_000,
  });
  const wasInterrupted = interruptedQuery.data ?? false;

  // Stuck send detection — show banner if no response after timeout
  const [sendStuck, setSendStuck] = useState(false);
  const stuckTimerRef = useRef<number | null>(null);
  const handleRespondingChange = useCallback((responding: boolean) => {
    setIsResponding(responding);
    if (stuckTimerRef.current) { clearTimeout(stuckTimerRef.current); stuckTimerRef.current = null; }
    if (responding) {
      setSendStuck(false);
      stuckTimerRef.current = window.setTimeout(() => setSendStuck(true), 10_000);
    } else {
      setSendStuck(false);
    }
  }, []);

  // Sessions with active streaming — keep mounted even when hidden
  const [respondingSessions, setRespondingSessions] = useState<Set<string>>(
    new Set(),
  );
  const [viewSessionKey, setViewSessionKey] = useState(urlSessionId ?? "new");
  const adapterSessionLockRef = useRef<string | null>(null);
  const [pendingApproval, setPendingApproval] = useState<
    (ApprovalInfo & { sessionId: string }) | null
  >(null);
  const [approvalProcessing, setApprovalProcessing] = useState(false);
  const [pendingCreatedSessionId, setPendingCreatedSessionId] = useState<
    string | null
  >(null);
  const [suppressSessionLoadingId, setSuppressSessionLoadingId] = useState<
    string | null
  >(null);
  const userName = useAppStore((state) => state.userName);
  const userAvatarUrl = useAppStore((state) => state.userAvatarUrl);

  const scheduleHideSidebarScrollbar = useCallback(() => {
    if (sidebarScrollbarTimerRef.current) {
      window.clearTimeout(sidebarScrollbarTimerRef.current);
    }
    sidebarScrollbarTimerRef.current = window.setTimeout(() => {
      setShowSidebarTransientScrollbar(false);
      sidebarScrollbarTimerRef.current = null;
    }, 800);
  }, []);

  const handleSidebarScroll = useCallback(() => {
    setShowSidebarTransientScrollbar(true);
    scheduleHideSidebarScrollbar();
  }, [scheduleHideSidebarScrollbar]);

  useEffect(() => {
    return () => {
      if (sidebarScrollbarTimerRef.current) {
        window.clearTimeout(sidebarScrollbarTimerRef.current);
      }
    };
  }, []);

  const { data: sessions = [], refetch: refetchSessions } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => chatApi.listSessions().then((r) => r.data),
  });
  const { data: models = [] } = useQuery({
    queryKey: ["models"],
    queryFn: () => modelsApi.list().then((r) => r.data),
  });
  const { data: providers = [] } = useQuery({
    queryKey: ["providers"],
    queryFn: () => providersApi.list().then((r) => r.data),
  });
  const { data: agents = [] } = useQuery({
    queryKey: ["agents"],
    queryFn: () => agentsApi.list().then((r) => r.data),
  });
  const { data: currentMessages = [], isLoading: messagesLoading } = useQuery({
    queryKey: ["messages", urlSessionId],
    queryFn: () => chatApi.listMessages(urlSessionId!).then((r) => r.data),
    enabled: !!urlSessionId,
  });

  const updateSessionMutation = useQueryClient();

  const currentSession = (sessions as any[]).find((s) => s.id === urlSessionId);
  const currentAgent = (agents as any[]).find(
    (a) => a.id === (currentSession?.agent_id || selectedAgentId),
  );
  const currentModel = (models as any[]).find(
    (model) => model.id === (currentSession?.model_id || selectedModelId),
  );
  const currentAgentModel = (models as any[]).find(
    (model) => model.id === currentAgent?.model_id,
  );
  const assistantDisplayName =
    mode === "agent"
      ? currentAgentModel?.name ||
        currentAgentModel?.model_id ||
        currentAgent?.name ||
        "AI"
      : currentModel?.name || currentModel?.model_id || "AI";
  const assistantIdentity = useMemo(
    () => ({
      displayName: assistantDisplayName,
      avatarLabel: getAvatarLabel(assistantDisplayName),
    }),
    [assistantDisplayName],
  );
  const userIdentity = useMemo(
    () => ({
      displayName: (userName || "").trim() || t("chat.user.default-name"),
      avatarLabel: getAvatarLabel(
        (userName || "").trim() || t("chat.user.default-name"),
      ),
      avatarUrl: (userAvatarUrl || "").trim(),
    }),
    [t, userName, userAvatarUrl],
  );

  const agentCapabilityFlags = useMemo(() => {
    if (!currentAgent) return emptyCapabilityFlags;
    return {
      tool: parseJsonArray(currentAgent.tool_ids_json).length > 0,
      mcp: parseJsonArray(currentAgent.mcp_server_ids_json).length > 0,
      reasoning: false,
      skills: parseJsonArray(currentAgent.skill_ids_json).length > 0,
      rag: parseJsonArray(currentAgent.kb_ids_json).length > 0,
    };
  }, [currentAgent]);

  const { data: runtimeCapabilityFlags = emptyCapabilityFlags } = useQuery({
    queryKey: ["chat-runtime-capabilities", urlSessionId],
    enabled: !!urlSessionId,
    queryFn: async () => {
      const runs = await chatApi
        .listRuns(urlSessionId!)
        .then((r) => r.data || []);
      const runIds = (runs as any[])
        .map((run) => run?.id)
        .filter(Boolean)
        .slice(0, 8);
      if (runIds.length === 0) return { ...emptyCapabilityFlags };

      const details = await Promise.allSettled(
        runIds.map((id) => obsApi.getRun(id).then((res) => res.data)),
      );

      const flags = { ...emptyCapabilityFlags };
      for (const detail of details) {
        if (detail.status !== "fulfilled") continue;
        const data = detail.value;
        const summaryMetadata = data?.summary?.metadata;
        if (summaryMetadata?.reasoning_mode === "deep") {
          flags.reasoning = true;
        }

        const steps = Array.isArray(data?.steps) ? data.steps : [];
        for (const step of steps) {
          const type = String(step?.step_type || "").toLowerCase();
          const name = String(step?.name || "").toLowerCase();

          if (
            type === "retrieval" ||
            name.includes("retrieval") ||
            name.includes("rag")
          ) {
            flags.rag = true;
          }
          if (type === "tool_call" || name.includes("tool")) {
            flags.tool = true;
          }
          if (type === "mcp_call" || name.includes("mcp")) {
            flags.mcp = true;
          }
          if (type === "skill_call" || name.includes("skill")) {
            flags.skills = true;
          }
          if (
            type === "llm_call" &&
            step?.metadata &&
            typeof step.metadata === "object" &&
            (step.metadata as any).reasoning_mode === "deep"
          ) {
            flags.reasoning = true;
          }
        }
      }

      return flags;
    },
  });

  const topCapabilities = useMemo(
    () => ({
      tool: runtimeCapabilityFlags.tool || agentCapabilityFlags.tool,
      mcp: runtimeCapabilityFlags.mcp || agentCapabilityFlags.mcp,
      reasoning:
        runtimeCapabilityFlags.reasoning ||
        reasoningMode === "deep" ||
        currentSession?.reasoning_mode === "deep",
      skills: runtimeCapabilityFlags.skills || agentCapabilityFlags.skills,
      rag: runtimeCapabilityFlags.rag || agentCapabilityFlags.rag,
    }),
    [
      runtimeCapabilityFlags,
      agentCapabilityFlags,
      reasoningMode,
      currentSession?.reasoning_mode,
    ],
  );

  const topCapabilityItems = useMemo(
    () =>
      [
        {
          key: "tool",
          visible: topCapabilities.tool,
          label: t("tools"),
          icon: Wrench,
        },
        {
          key: "mcp",
          visible: topCapabilities.mcp,
          label: t("mcp"),
          icon: Server,
        },
        {
          key: "reasoning",
          visible: topCapabilities.reasoning,
          label: t("chat.reasoning.label"),
          icon: BrainCircuit,
        },
        {
          key: "skills",
          visible: topCapabilities.skills,
          label: t("skills"),
          icon: Zap,
        },
        {
          key: "rag",
          visible: topCapabilities.rag,
          label: t("rag"),
          icon: BookOpen,
        },
      ].filter((item) => item.visible),
    [topCapabilities],
  );

  useEffect(() => {
    if (urlSessionId) return;
    if ((location.state as any)?.forceNew) return;
    const firstSessionId = (sessions as any[])[0]?.id;
    if (!firstSessionId) return;
    navigate(`/chat/${firstSessionId}`, { replace: true });
  }, [urlSessionId, sessions, navigate, location.state]);

  useEffect(() => {
    if (!currentSession) return;
    setMode(currentSession.mode || "model");
    setSelectedModelId(currentSession.model_id || "");
    setSelectedAgentId(currentSession.agent_id || "");
    setReasoningMode(currentSession.reasoning_mode || "standard");
    setStreamOutput(currentSession.stream_output ?? true);
    setMemoryEnabled(
      currentSession.memory_enabled ?? currentSession.mode === "agent",
    );
  }, [currentSession]);

  // For new conversations: stream ON by default, memory ON for agents
  useEffect(() => {
    if (currentSession) return;
    setStreamOutput(true);
    setMemoryEnabled(mode === "agent");
  }, [mode, currentSession]);

  useEffect(() => {
    // When the adapter created a session, lock the ChatSessionView key to prevent
    // remount. Only release when the user explicitly switches to a different session.
    if (adapterSessionLockRef.current) {
      if (urlSessionId === adapterSessionLockRef.current) return;
      adapterSessionLockRef.current = null;
    }
    if (pendingCreatedSessionId && urlSessionId === pendingCreatedSessionId) {
      setPendingCreatedSessionId(null);
      return;
    }
    setViewSessionKey(urlSessionId ?? "new");
  }, [urlSessionId, pendingCreatedSessionId]);

  useEffect(() => {
    if (!urlSessionId || !suppressSessionLoadingId) return;
    if (urlSessionId !== suppressSessionLoadingId) return;
    if (messagesLoading) return;
    setSuppressSessionLoadingId(null);
  }, [urlSessionId, suppressSessionLoadingId, messagesLoading]);

  const syncCurrentSession = async (patch: Record<string, unknown>) => {
    if (!urlSessionId) return;
    await chatApi.updateSession(urlSessionId, patch);
    updateSessionMutation.invalidateQueries({ queryKey: ["chat-sessions"] });
  };

  useEffect(() => {
    if (!currentSession || !urlSessionId) return;
    if (!currentSession.search_enabled && !currentSession.search_provider)
      return;
    void syncCurrentSession({ search_enabled: false, search_provider: null });
  }, [
    currentSession?.id,
    currentSession?.search_enabled,
    currentSession?.search_provider,
    urlSessionId,
  ]);

  const handleSessionCreated = useCallback(
    (id: string) => {
      adapterSessionLockRef.current = id;
      setPendingCreatedSessionId(id);
      setSuppressSessionLoadingId(id);
      refetchSessions();
      navigate(`/chat/${id}`, { replace: true });
    },
    [navigate, refetchSessions],
  );

  const addToast = useToastStore((s) => s.addToast);

  const handleStreamingChange = useCallback(
    (key: string) => (streaming: boolean) => {
      setRespondingSessions((prev) => {
        const next = new Set(prev);
        streaming ? next.add(key) : next.delete(key);
        return next;
      });
    },
    [],
  );

  const handleToolCall = useCallback(
    (info: ToolCallInfo) => {
      const label =
        info.name === "Web Search"
          ? t("chat.tool.searching", { query: "" })
          : t("chat.tool.using", { name: info.name });
      addToast({ type: "info", message: label, duration: 3000 });
    },
    [addToast, t],
  );

  const handleApproval = useCallback(
    (info: ApprovalInfo, sessionId: string) => {
      setPendingApproval({ ...info, sessionId });
      setIsResponding(false);
    },
    [],
  );

  const handleApprove = useCallback(async () => {
    if (!pendingApproval) return;
    setApprovalProcessing(true);
    try {
      const res = await chatApi.approveAction(
        pendingApproval.sessionId,
        pendingApproval.run_id,
        true,
      );
      const data = res.data as any;
      if (data.type === "action_approved" && data.result) {
        // Re-trigger chat to get final response with action result
        setPendingApproval(null);
        // Send a follow-up to continue with the approved action context
        await chatApi.sendMessage(
          pendingApproval.sessionId,
          t("chat.approval.system-approved-message", {
            label: pendingApproval.label,
          }),
          false,
        );
        refetchSessions();
        qc.invalidateQueries({
          queryKey: ["messages", pendingApproval.sessionId],
        });
      }
    } catch {
      // ignore
    } finally {
      setApprovalProcessing(false);
      setPendingApproval(null);
    }
  }, [pendingApproval, refetchSessions, qc, t]);

  const handleDeny = useCallback(async () => {
    if (!pendingApproval) return;
    setApprovalProcessing(true);
    try {
      await chatApi.approveAction(
        pendingApproval.sessionId,
        pendingApproval.run_id,
        false,
      );
    } catch {
      // ignore
    } finally {
      setApprovalProcessing(false);
      setPendingApproval(null);
    }
  }, [pendingApproval]);

  const showRouteLoading =
    !!urlSessionId &&
    messagesLoading &&
    viewSessionKey === urlSessionId &&
    suppressSessionLoadingId !== urlSessionId;

  const deleteSession = async (id: string) => {
    // Optimistically remove from UI immediately
    qc.setQueryData(["chat-sessions"], (old: any) =>
      Array.isArray(old) ? old.filter((s: any) => s.id !== id) : old,
    );
    if (urlSessionId === id) navigate("/chat");
    try {
      await chatApi.deleteSession(id);
    } catch {
      // Rollback on failure
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    }
  };

  const canSend =
    (mode === "model" && !!selectedModelId) ||
    (mode === "agent" && !!selectedAgentId);
  const hasMessagesInCurrentSession = (currentMessages as any[]).length > 0;
  const lockModeSwitch = Boolean(urlSessionId) && hasMessagesInCurrentSession;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex h-full min-h-0 overflow-hidden">
        {/* Main area */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-background h-[3rem]">
            <span className="text-sm font-medium">
              {mode === "agent" && currentAgent
                ? currentAgent.name
                : mode === "model" && currentModel
                  ? currentModel.name
                  : t("chat")}
            </span>
            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => {
                      setMode("model");
                      setSelectedModelId("");
                      setSelectedAgentId("");
                      navigate("/chat", { state: { forceNew: true } });
                    }}
                  >
                    <SquarePen className="w-4 h-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{t("new-chat")}</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setSidebarOpen((v) => !v)}
                  >
                    {sidebarOpen ? (
                      <PanelLeftClose className="w-4 h-4" />
                    ) : (
                      <PanelLeftOpen className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {sidebarOpen ? t("sidebar.collapse") : t("sidebar.expand")}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>

          {/* Chat */}
          {!canSend && !urlSessionId ? (
            /* Landing page — select model/agent before chatting */
            <div className="flex-1 flex items-center justify-center">
              <div className="w-full max-w-sm mx-auto space-y-4 p-6">
                <h3 className="text-lg font-semibold text-center">
                  {t("new-chat")}
                </h3>
                <Tabs
                  value={mode}
                  onValueChange={(v) => {
                    setMode(v as "model" | "agent");
                    setSelectedModelId("");
                    setSelectedAgentId("");
                  }}
                >
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="model" className="gap-1.5">
                      <Cpu className="w-3.5 h-3.5" />
                      {t("llm")}
                    </TabsTrigger>
                    <TabsTrigger value="agent" className="gap-1.5">
                      <Bot className="w-3.5 h-3.5" />
                      {t("agents")}
                    </TabsTrigger>
                  </TabsList>
                  <div className="mt-4">
                    {mode === "model" ? (
                      <ModelCombobox
                        value={selectedModelId}
                        onValueChange={setSelectedModelId}
                        models={models as any[]}
                        providers={providers as any[]}
                        className="h-10 text-sm w-full"
                        placeholder={t("chat.select-model-placeholder")}
                      />
                    ) : (
                      <Select
                        value={selectedAgentId}
                        onValueChange={setSelectedAgentId}
                      >
                        <SelectTrigger className="h-10 text-sm w-full">
                          <SelectValue
                            placeholder={t("chat.select-agent-placeholder")}
                          />
                        </SelectTrigger>
                        <SelectContent>
                          {(agents as any[]).map((a) => (
                            <SelectItem key={a.id} value={a.id}>
                              {a.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </Tabs>
                {!canSend && (
                  <p className="text-xs text-center text-muted-foreground">
                    {t("chat.select-model-or-agent")}
                  </p>
                )}
              </div>
            </div>
          ) : showRouteLoading ? (
            <div className="flex-1 px-6 py-5">
              <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4">
                <div className="h-4 w-44 animate-pulse rounded bg-muted/50" />
                <div className="h-24 animate-pulse rounded-2xl border border-border bg-card/70" />
                <div className="ml-auto h-20 w-[72%] animate-pulse rounded-2xl border border-border bg-card/70" />
                <div className="h-24 w-[78%] animate-pulse rounded-2xl border border-border bg-card/70" />
              </div>
            </div>
          ) : (
            <CanSendContext.Provider value={canSend}>
              <ChatControlsContext.Provider
                value={{
                  reasoningMode,
                  streamOutput,
                  memoryEnabled,
                  sessionId: urlSessionId ?? null,
                  toggleReasoning: () => {
                    const nextMode =
                      reasoningMode === "deep" ? "standard" : "deep";
                    setReasoningMode(nextMode);
                    void syncCurrentSession({ reasoning_mode: nextMode });
                  },
                  toggleStream: () => {
                    const nextValue = !streamOutput;
                    setStreamOutput(nextValue);
                    void syncCurrentSession({ stream_output: nextValue });
                  },
                  toggleMemory: () => {
                    const nextValue = !memoryEnabled;
                    setMemoryEnabled(nextValue);
                    void syncCurrentSession({ memory_enabled: nextValue });
                  },
                }}
              >
                <CapabilityItemsContext.Provider value={topCapabilityItems}>
                  <UserIdentityContext.Provider value={userIdentity}>
                    <AssistantIdentityContext.Provider
                      value={assistantIdentity}
                    >
                      <IsRespondingContext.Provider value={isResponding}>
                        <ChatSessionView
                          key={viewSessionKey}
                          sessionId={urlSessionId ?? null}
                          mode={mode}
                          modelId={selectedModelId}
                          agentId={selectedAgentId}
                          reasoningMode={reasoningMode}
                          streamOutput={streamOutput}
                          onSessionCreated={handleSessionCreated}
                          onRespondingChange={handleRespondingChange}
                          onApproval={handleApproval}
                          onStreamingChange={handleStreamingChange(
                            viewSessionKey,
                          )}
                          onToolCall={handleToolCall}
                          initialMessages={currentMessages}
                          initialSystemMessage={
                            mode === "agent" && currentAgent?.system_prompt
                              ? currentAgent.system_prompt
                              : null
                          }
                        />
                      </IsRespondingContext.Provider>

                      {/* Keep streaming sessions alive when hidden */}
                      {[...respondingSessions]
                        .filter((k) => k !== viewSessionKey)
                        .map((key) => {
                          const s = (sessions as any[]).find(
                            (x: any) => x.id === key,
                          );
                          if (!s) return null;
                          return (
                            <div
                              key={key}
                              style={{ display: "none" }}
                              aria-hidden
                            >
                              <ChatSessionView
                                sessionId={s.id}
                                mode={s.mode || "model"}
                                modelId={s.model_id || ""}
                                agentId={s.agent_id || ""}
                                reasoningMode={s.reasoning_mode || "standard"}
                                streamOutput={s.stream_output ?? true}
                                onSessionCreated={() => {}}
                                onRespondingChange={() => {}}
                                onApproval={() => {}}
                                onStreamingChange={handleStreamingChange(key)}
                                initialMessages={[]}
                                visible={false}
                              />
                            </div>
                          );
                        })}
                    </AssistantIdentityContext.Provider>
                  </UserIdentityContext.Provider>
                </CapabilityItemsContext.Provider>
              </ChatControlsContext.Provider>
            </CanSendContext.Provider>
          )}

          {/* Interrupted run recovery banner */}
          {wasInterrupted && (
            <div className="border-t border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-2 text-xs text-amber-700 dark:text-amber-400 text-center">
              Response was interrupted — partial reply has been saved. Send a new message to continue.
            </div>
          )}

          {/* Stuck send detection banner */}
          {sendStuck && isResponding && (
            <div className="border-t border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 px-4 py-2 text-xs text-amber-700 dark:text-amber-400 flex items-center justify-between">
              <span>Message sent — waiting for backend response. If this persists, the stream may be stuck.</span>
              <button onClick={() => setSendStuck(false)} className="underline ml-4">Dismiss</button>
            </div>
          )}

          {/* HITL Approval Card */}
          {pendingApproval && (
            <div className="border-t border-amber-200 bg-amber-50/60 dark:bg-amber-950/20 dark:border-amber-800 px-5 py-3">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 dark:bg-amber-900/40 text-amber-600">
                  <BrainCircuit className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {t("chat.approval-required")}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("chat.approval-action")}{" "}
                    <span className="font-mono text-amber-700 dark:text-amber-400">
                      {pendingApproval.label}
                    </span>
                  </p>
                  {Object.keys(pendingApproval.arguments).length > 0 && (
                    <pre className="mt-1 text-[10px] text-muted-foreground bg-muted/30 rounded p-1.5 max-h-20 overflow-auto">
                      {JSON.stringify(pendingApproval.arguments, null, 2)}
                    </pre>
                  )}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    onClick={handleDeny}
                    disabled={approvalProcessing}
                  >
                    {t("chat.deny")}
                  </Button>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    onClick={handleApprove}
                    disabled={approvalProcessing}
                  >
                    {approvalProcessing
                      ? t("common.processing")
                      : t("chat.approve")}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Session Sidebar (right) */}
        <div
          className={cn(
            "flex flex-col flex-shrink-0 border-l border-border bg-background transition-all duration-200 overflow-hidden",
            sidebarOpen ? "w-56" : "w-0",
          )}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-border h-[3rem]">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              {t("dashboard.sessions")}
            </span>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() =>
                    navigate("/chat", { state: { forceNew: true } })
                  }
                >
                  <SquarePen className="w-3.5 h-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{t("new-chat")}</TooltipContent>
            </Tooltip>
          </div>

          {/* Session list */}
          <div
            onScroll={handleSidebarScroll}
            className={cn(
              "flex-1 overflow-y-auto sidebar-scrollbar p-2 space-y-0.5",
              showSidebarTransientScrollbar && "sidebar-scrollbar--active",
            )}
          >
            {(sessions as any[]).map((s) => (
              <SessionItem
                key={s.id}
                session={s}
                active={s.id === urlSessionId}
                onClick={() => navigate(`/chat/${s.id}`)}
                onDelete={deleteSession}
                models={models}
                agents={agents}
              />
            ))}
            {sessions.length === 0 && (
              <p className="text-center text-muted-foreground text-xs py-6">
                {t("chat.no-session")}
              </p>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
