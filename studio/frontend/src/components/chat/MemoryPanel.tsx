import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { memoriesApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronDown,
  ChevronRight,
  Database,
  Pencil,
  Check,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface MemoryEntry {
  id: string;
  key: string;
  value: string;
}

interface MemoryPanelProps {
  sessionId: string | null;
  visible: boolean;
}

export function MemoryPanel({ sessionId, visible }: MemoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  const { data: memories = [] } = useQuery({
    queryKey: ["memories", sessionId],
    queryFn: () =>
      memoriesApi.list({ session_id: sessionId! }).then((r) => r.data),
    enabled: !!sessionId && visible && open,
    refetchInterval: 15_000,
  });

  // Reset editing when panel collapses
  useEffect(() => {
    if (!open) {
      setEditingId(null);
      setEditValue("");
    }
  }, [open]);

  if (!visible || !sessionId) return null;

  const startEdit = (m: MemoryEntry) => {
    setEditingId(m.id);
    setEditValue(m.value);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue("");
  };

  const saveEdit = async (memoryId: string) => {
    if (!editValue.trim()) return;
    setSaving(true);
    try {
      await memoriesApi.update(memoryId, editValue.trim());
      qc.invalidateQueries({ queryKey: ["memories", sessionId] });
      setEditingId(null);
      setEditValue("");
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="border-t border-border/60 bg-muted/20">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full px-4 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" />
        )}
        <Database className="h-3.5 w-3.5" />
        <span className="font-medium">Memory</span>
        {!open && memories.length > 0 && (
          <span className="text-muted-foreground/60">
            ({memories.length} {memories.length === 1 ? "entry" : "entries"})
          </span>
        )}
      </button>

      {open && (
        <div className="px-4 pb-3 space-y-1.5 max-h-[240px] overflow-y-auto">
          {memories.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">
              No memories yet. They will appear here as the agent learns from the conversation.
            </p>
          ) : (
            memories.map((m) => (
              <div
                key={m.id}
                className="group flex items-start gap-2 rounded-lg px-2.5 py-2 hover:bg-background/60 transition-colors"
              >
                {editingId === m.id ? (
                  <div className="flex-1 space-y-1.5">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      {m.key}
                    </span>
                    <Textarea
                      className="min-h-[60px] text-xs font-mono resize-y"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                          saveEdit(m.id);
                        }
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                    />
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={() => saveEdit(m.id)}
                        disabled={saving || !editValue.trim()}
                      >
                        <Check className="h-3 w-3 mr-1" /> Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[11px]"
                        onClick={cancelEdit}
                      >
                        <X className="h-3 w-3 mr-1" /> Cancel
                      </Button>
                      <span className="text-[10px] text-muted-foreground ml-auto">
                        ⌘↵ to save
                      </span>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {m.key}
                      </span>
                      <p className="text-xs leading-relaxed mt-0.5 text-foreground/80 line-clamp-3">
                        {m.value}
                      </p>
                    </div>
                    <button
                      onClick={() => startEdit(m)}
                      className={cn(
                        "p-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-all opacity-0 group-hover:opacity-100 flex-shrink-0",
                      )}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
