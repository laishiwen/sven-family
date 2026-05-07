import { useState, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { datasetsApi } from "@/lib/api";
import { Plus, Database, Trash2, Upload, Eye, Wand2, Download } from "lucide-react";

function UploadModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState("");
  const [fieldMap, setFieldMap] = useState({ instruction: "", input: "", output: "" });

  const uploadMut = useMutation({
    mutationFn: (data: any) => datasetsApi.upload(data.file, { name: data.name, field_mapping: data.fieldMap }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["datasets"] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border"><DialogTitle className="text-base">{t("datasets.upload-dataset")}</DialogTitle></DialogHeader>
        <div className="p-5 space-y-3">
          <div className="space-y-1.5"><Label>{t("datasets.name-required")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my-dataset" /></div>
          <div className="space-y-1.5">
            <Label>{t("datasets.select-file")}</Label>
            <Input ref={fileRef} type="file" accept=".jsonl,.csv,.parquet" className="hidden" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <Button variant="outline" className="gap-1.5" onClick={() => fileRef.current?.click()}><Upload className="w-3.5 h-3.5" />{file ? file.name : t("datasets.choose-file")}</Button>
          </div>
          <div className="space-y-1.5">
            <Label>{t("datasets.field-mapping")}</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["instruction", "input", "output"] as const).map((f) => (
                <div key={f}><label className="text-xs text-muted-foreground mb-1 block">{f}</label><Input className="text-xs h-8" value={fieldMap[f]} onChange={(e) => setFieldMap({ ...fieldMap, [f]: e.target.value })} placeholder={f} /></div>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border sm:justify-end">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={!file || !name || uploadMut.isPending} onClick={() => { if (!file || !name) return; uploadMut.mutate({ file, name, fieldMap }); }}>{uploadMut.isPending ? t("datasets.uploading") : t("upload")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProcessModal({ dataset, onClose }: { dataset: any; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [form, setForm] = useState({ output_format: dataset.format || "jsonl", rename_map_json: "{}", drop_columns_json: "[]", deduplicate_by_json: "[]", sample_size: "" });
  const processMut = useMutation({
    mutationFn: () => datasetsApi.process(dataset.id, { output_format: form.output_format, processing_config: { rename_map: JSON.parse(form.rename_map_json || "{}"), drop_columns: JSON.parse(form.drop_columns_json || "[]"), deduplicate_by: JSON.parse(form.deduplicate_by_json || "[]"), sample_size: form.sample_size ? Number(form.sample_size) : undefined } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["datasets"] }); qc.invalidateQueries({ queryKey: ["dataset-preview", dataset.id] }); onClose(); },
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl p-0 gap-0">
        <DialogHeader className="px-5 py-3 border-b border-border"><DialogTitle className="text-base">{t("datasets.custom-process")}</DialogTitle></DialogHeader>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label>{t("datasets.output-format")}</Label><Input value={form.output_format} onChange={(e) => setForm({ ...form, output_format: e.target.value })} placeholder="jsonl / csv / parquet" /></div>
            <div className="space-y-1.5"><Label>{t("datasets.sample-size")}</Label><Input value={form.sample_size} onChange={(e) => setForm({ ...form, sample_size: e.target.value })} placeholder={t("datasets.sample-placeholder")} /></div>
          </div>
          <div className="space-y-1.5"><Label>{t("datasets.rename-json")}</Label><Textarea className="min-h-[70px] font-mono text-xs" value={form.rename_map_json} onChange={(e) => setForm({ ...form, rename_map_json: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("datasets.drop-columns-json")}</Label><Textarea className="min-h-[60px] font-mono text-xs" value={form.drop_columns_json} onChange={(e) => setForm({ ...form, drop_columns_json: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>{t("datasets.dedupe-json")}</Label><Textarea className="min-h-[60px] font-mono text-xs" value={form.deduplicate_by_json} onChange={(e) => setForm({ ...form, deduplicate_by_json: e.target.value })} /></div>
        </div>
        <DialogFooter className="px-5 py-3 border-t border-border sm:justify-end">
          <Button variant="outline" onClick={onClose}>{t("cancel")}</Button>
          <Button disabled={processMut.isPending} onClick={() => processMut.mutate()}>{processMut.isPending ? t("datasets.processing") : t("datasets.start-processing")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PreviewModal({ dataset, onClose }: { dataset: any; onClose: () => void }) {
  const { t } = useTranslation();
  const { data } = useQuery({ queryKey: ["dataset-preview", dataset.id], queryFn: () => datasetsApi.preview(dataset.id).then((r) => r.data) });
  const rows: any[] = data?.rows || [];
  const columns: string[] = rows.length > 0 ? Object.keys(rows[0]) : [];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl p-0 gap-0 max-h-[80vh] overflow-hidden">
        <DialogHeader className="px-5 py-3 border-b border-border"><DialogTitle className="text-base">{dataset.name}</DialogTitle></DialogHeader>
        <div className="flex-1 overflow-auto p-4">
          {rows.length > 0 ? (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-border">{columns.map((c) => <th key={c} className="text-left py-2 px-3 text-xs font-medium text-muted-foreground">{c}</th>)}</tr></thead>
              <tbody>{rows.map((row, i) => <tr key={i} className="border-b border-border/50">{columns.map((c) => <td key={c} className="py-2 px-3 max-w-xs"><span className="line-clamp-2 text-xs">{String(row[c] ?? "")}</span></td>)}</tr>)}</tbody>
            </table>
          ) : <p className="text-center text-muted-foreground py-8 text-sm">{t("datasets.no-data")}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function DatasetsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [showUpload, setShowUpload] = useState(false);
  const [previewDs, setPreviewDs] = useState<any>(null);
  const [pendingDeleteDs, setPendingDeleteDs] = useState<any>(null);
  const [processingDs, setProcessingDs] = useState<any>(null);

  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: () => datasetsApi.list().then((r) => r.data) });
  const deleteMut = useMutation({ mutationFn: (id: string) => datasetsApi.delete(id), onSuccess: () => qc.invalidateQueries({ queryKey: ["datasets"] }) });
  const exportMut = useMutation({ mutationFn: (id: string) => datasetsApi.export(id) });

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setShowUpload(true)}><Plus className="w-3.5 h-3.5" />{t("datasets.upload-dataset")}</Button>
      </div>

      {datasets.length === 0 ? (
        <EmptyState icon={<Database className="w-5 h-5" />} title={t("datasets.empty-title")} description={t("datasets.empty-description")} action={{ label: t("datasets.upload-first"), onClick: () => setShowUpload(true) }} />
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("datasets.column.name")}</th>
                <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("datasets.column.format")}</th>
                <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("datasets.column.rows")}</th>
                <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">{t("datasets.column.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {datasets.map((ds: any) => (
                <tr key={ds.id} className="hover:bg-muted/30">
                  <td className="py-2.5 px-4"><div className="flex items-center gap-2"><Database className="w-3.5 h-3.5 text-muted-foreground" /><span className="font-medium text-sm">{ds.name}</span></div></td>
                  <td className="py-2.5 px-4"><Badge variant="secondary" className="text-[10px] uppercase">{ds.format || "jsonl"}</Badge></td>
                  <td className="py-2.5 px-4 text-sm text-muted-foreground">{ds.row_count?.toLocaleString() || "–"}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center justify-end gap-0.5">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setProcessingDs(ds)}><Wand2 className="w-3.5 h-3.5" /></Button>
                        </TooltipTrigger>
                        <TooltipContent>Process dataset</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => exportMut.mutate(ds.id)}><Download className="w-3.5 h-3.5" /></Button>
                        </TooltipTrigger>
                        <TooltipContent>Export dataset</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPreviewDs(ds)}><Eye className="w-3.5 h-3.5" /></Button>
                        </TooltipTrigger>
                        <TooltipContent>Preview dataset</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 hover:text-destructive" onClick={() => setPendingDeleteDs(ds)}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </TooltipTrigger>
                        <TooltipContent>Delete dataset</TooltipContent>
                      </Tooltip>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
      {processingDs && <ProcessModal dataset={processingDs} onClose={() => setProcessingDs(null)} />}
      {previewDs && <PreviewModal dataset={previewDs} onClose={() => setPreviewDs(null)} />}

      <ConfirmDialog
        open={!!pendingDeleteDs} onOpenChange={(open) => { if (!open) setPendingDeleteDs(null); }}
        title={t("datasets.confirm-delete-title")} description={pendingDeleteDs ? t("datasets.confirm-delete-description", { name: pendingDeleteDs.name }) : undefined}
        confirmText={t("delete")} onConfirm={() => { if (!pendingDeleteDs) return; deleteMut.mutate(pendingDeleteDs.id); setPendingDeleteDs(null); }} loading={deleteMut.isPending}
      />
    </div>
  );
}
