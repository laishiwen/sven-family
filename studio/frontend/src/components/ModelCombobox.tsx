import { useState, useMemo } from "react";
import { Search, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useTranslation } from "react-i18next";

export type ProviderRecord = {
  id: string;
  name: string;
  provider_type: string;
};

export const PROVIDER_TYPE_LABELS: Record<string, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google AI",
  ollama: "Ollama",
  custom: "provider-type.custom",
};

function resolveProviderTypeLabel(
  providerType: string,
  t: (key: string) => string,
) {
  const label = PROVIDER_TYPE_LABELS[providerType];
  return label?.startsWith("provider-type.")
    ? t(label)
    : (label ?? providerType);
}

type Props = {
  value: string;
  onValueChange: (v: string) => void;
  models: any[];
  providers: ProviderRecord[];
  /** Trigger button extra className (e.g. size / width overrides) */
  className?: string;
  placeholder?: string;
};

export function ModelCombobox({
  value,
  onValueChange,
  models,
  providers,
  className,
  placeholder,
}: Props) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const resolvedPlaceholder = placeholder ?? t("select-model");

  const providerMap = useMemo(
    () => Object.fromEntries(providers.map((p) => [p.id, p])),
    [providers],
  );

  const selectedModel = useMemo(
    () => models.find((m) => m.id === value),
    [models, value],
  );

  const selectedProvider = selectedModel
    ? providerMap[selectedModel.provider_id]
    : undefined;

  const filteredGroups = useMemo(() => {
    const query = search.trim().toLowerCase();
    const groups: Map<string, any[]> = new Map();
    for (const model of models) {
      const list = groups.get(model.provider_id) ?? [];
      if (
        !query ||
        model.name.toLowerCase().includes(query) ||
        model.model_id.toLowerCase().includes(query) ||
        (providerMap[model.provider_id]?.name || "")
          .toLowerCase()
          .includes(query)
      ) {
        list.push(model);
      }
      groups.set(model.provider_id, list);
    }
    for (const [key, list] of groups) {
      if (list.length === 0) groups.delete(key);
    }
    return groups;
  }, [models, search, providerMap]);

  const triggerLabel = selectedModel ? selectedModel.name : resolvedPlaceholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex h-9 w-full items-center justify-between rounded-lg border border-input bg-background px-3 py-2 text-sm shadow-sm ring-offset-background hover:bg-muted/50 focus:outline-none focus:ring-2 focus:ring-ring",
            !value && "text-muted-foreground",
            className,
          )}
        >
          <span className="flex items-center gap-2 min-w-0">
            {selectedProvider && (
              <span className="shrink-0 rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
                {resolveProviderTypeLabel(selectedProvider.provider_type, t)}
              </span>
            )}
            <span className="truncate">{triggerLabel}</span>
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="overflow-hidden p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Search */}
        <div className="flex items-center gap-2 border-b border-border px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            placeholder={t("model-combobox.search-placeholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {/* List */}
        <div
          className="max-h-64 overflow-y-auto py-1"
          onWheel={(e) => e.stopPropagation()}
        >
          {filteredGroups.size === 0 && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">
              {t("model-combobox.no-match")}
            </p>
          )}

          {Array.from(filteredGroups.entries()).map(
            ([providerId, groupModels]) => {
              const provider = providerMap[providerId];
              const groupLabel = provider
                ? `${provider.name}  ·  ${resolveProviderTypeLabel(
                    provider.provider_type,
                    t,
                  )}`
                : providerId;
              return (
                <div key={providerId}>
                  <div className="px-3 py-1.5 text-xs font-semibold text-muted-foreground">
                    {groupLabel}
                  </div>
                  {groupModels.map((model) => (
                    <button
                      key={model.id}
                      type="button"
                      onClick={() => {
                        onValueChange(model.id);
                        setOpen(false);
                        setSearch("");
                      }}
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-muted/60",
                        value === model.id && "font-medium text-primary",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          value === model.id
                            ? "opacity-100 text-primary"
                            : "opacity-0",
                        )}
                      />
                      <span className="truncate">{model.name}</span>
                      {model.name !== model.model_id && (
                        <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                          {model.model_id}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              );
            },
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
