import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { finetuneApi } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Plus, Play, X, Cpu, ChevronDown, ChevronUp, CheckCircle, Loader2, XCircle } from "lucide-react";

function CreateJobModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: "", base_model: "llama3-8b", dataset_id: "", epochs: 3, lr: 2e-4, batch_size: 4, lora_r: 8, lora_alpha: 32 });

  const { data: datasets = [] } = useQuery({ queryKey: ["datasets"], queryFn: () => finetuneApi.listDatasets().then((r) => r.data) });
  const createMut = useMutation({ mutationFn: (data: any) => finetuneApi.createJob(data), onSuccess: () => { qc.invalidateQueries({ queryKey: ["finetune-jobs"] }); onClose(); } });

  const models = ["llama3-8b", "llama3-70b", "mistral-7b", "qwen2-7b", "gemma-7b"];

  const content = (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-lg mx-4">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border">
          <div><h2 className="text-base font-semibold">{t("lora.create-job")}</h2><p className="text-xs text-muted-foreground">{t("lora.step", { step })}</p></div>
          <Tooltip><TooltipTrigger asChild><Button onClick={onClose} variant="ghost" size="icon" className="h-7 w-7"><X className="w-4 h-4" /></Button></TooltipTrigger><TooltipContent>Close</TooltipContent></Tooltip>
        </div>
        <div className="p-5">
          {step === 1 && (
            <div className="space-y-3">
              <h3 className="font-medium text-sm">{t("lora.basic-info")}</h3>
              <div className="space-y-1.5"><label className="text-sm font-medium">{t("lora.job-name")}</label><input className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="my-finetune-job" /></div>
              <div className="space-y-1.5"><label className="text-sm font-medium">{t("lora.base-model")}</label><select className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.base_model} onChange={(e) => setForm({ ...form, base_model: e.target.value })}>{models.map((m) => <option key={m}>{m}</option>)}</select></div>
            </div>
          )}
          {step === 2 && (
            <div className="space-y-3">
              <h3 className="font-medium text-sm">{t("lora.select-dataset")}</h3>
              <div className="space-y-1.5 max-h-60 overflow-y-auto">
                {datasets.length === 0 && <p className="text-sm text-muted-foreground">{t("lora.no-datasets")}</p>}
                {datasets.map((ds: any) => (
                  <label key={ds.id} className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${form.dataset_id === ds.id ? "border-primary bg-primary/5" : "border-border"}`}>
                    <input type="radio" checked={form.dataset_id === ds.id} onChange={() => setForm({ ...form, dataset_id: ds.id })} className="hidden" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${form.dataset_id === ds.id ? "border-primary" : "border-muted-foreground/30"}`}>{form.dataset_id === ds.id && <div className="w-2 h-2 rounded-full bg-primary" />}</div>
                    <div><p className="text-sm font-medium">{ds.name}</p><p className="text-xs text-muted-foreground">{t("lora.rows-format", { count: ds.row_count, format: ds.format })}</p></div>
                  </label>
                ))}
              </div>
            </div>
          )}
          {step === 3 && (
            <div className="space-y-3">
              <h3 className="font-medium text-sm">{t("lora.hyperparameters")}</h3>
              <div className="grid grid-cols-2 gap-3">
                {[
                  ["epochs", t("lora.hyperparameters.epochs-label")], ["batch_size", t("lora.hyperparameters.batch-size-label")],
                  ["lora_r", t("lora.hyperparameters.lora-rank-label")], ["lora_alpha", t("lora.hyperparameters.lora-alpha-label")],
                ].map(([key, label]) => (
                  <div key={key} className="space-y-1.5"><label className="text-sm font-medium">{label}</label><input type="number" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={(form as any)[key]} onChange={(e) => setForm({ ...form, [key]: parseInt(e.target.value) })} /></div>
                ))}
              </div>
              <div className="space-y-1.5"><label className="text-sm font-medium">{t("lora.hyperparameters.learning-rate-label")}</label><input type="number" step="0.0001" className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm" value={form.lr} onChange={(e) => setForm({ ...form, lr: parseFloat(e.target.value) })} /></div>
            </div>
          )}
          {step === 4 && (
            <div className="space-y-2">
              <h3 className="font-medium text-sm">{t("lora.confirm-config")}</h3>
              <div className="bg-muted/30 rounded-lg p-3 space-y-1.5 text-sm">
                {Object.entries({ [t("lora.summary.name")]: form.name, [t("lora.summary.base-model")]: form.base_model, [t("lora.summary.epochs")]: form.epochs, [t("lora.summary.batch-size")]: form.batch_size, [t("lora.summary.lora-r")]: form.lora_r }).map(([k, v]) => <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}</span><span>{v}</span></div>)}
              </div>
            </div>
          )}
        </div>
        <div className="flex justify-between px-5 py-3 border-t border-border">
          <Button variant="outline" onClick={step === 1 ? onClose : () => setStep(step - 1)}>{step === 1 ? t("lora.cancel") : t("lora.previous")}</Button>
          <Button className="gap-1.5" disabled={(step === 1 && !form.name) || (step === 2 && !form.dataset_id) || createMut.isPending} onClick={() => step < 4 ? setStep(step + 1) : createMut.mutate(form)}>
            {createMut.isPending ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />{t("lora.creating")}</> : step === 4 ? <><Play className="w-3.5 h-3.5" />{t("lora.start-training")}</> : t("lora.next")}
          </Button>
        </div>
      </div>
    </div>
  );
  if (typeof document === "undefined") return null;
  return createPortal(content, document.body);
}

function JobLogs({ jobId }: { jobId: string }) {
  const { t } = useTranslation();
  const logRef = useRef<HTMLDivElement>(null);
  const { data } = useQuery({ queryKey: ["job-logs", jobId], queryFn: () => finetuneApi.getLogs(jobId).then((r) => r.data), refetchInterval: 3000 });
  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [data]);
  return <div ref={logRef} className="max-h-40 overflow-y-auto text-xs font-mono bg-muted/20 rounded p-2.5">{data?.logs || t("lora.waiting-logs")}</div>;
}

function JobCard({ job }: { job: any }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [expanded, setExpanded] = useState(false);
  const cancelMut = useMutation({ mutationFn: () => finetuneApi.cancelJob(job.id), onSuccess: () => qc.invalidateQueries({ queryKey: ["finetune-jobs"] }) });
  const registerMut = useMutation({ mutationFn: () => finetuneApi.registerModel(job.id), onSuccess: () => qc.invalidateQueries({ queryKey: ["finetune-jobs"] }) });

  const iconMap: Record<string, JSX.Element> = { running: <Loader2 className="w-4 h-4 animate-spin text-blue-500" />, success: <CheckCircle className="w-4 h-4 text-emerald-500" />, failed: <XCircle className="w-4 h-4 text-red-500" />, pending: <Loader2 className="w-4 h-4 text-muted-foreground" />, cancelled: <XCircle className="w-4 h-4 text-muted-foreground" /> };
  const icon = iconMap[job.status] || null;

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30" onClick={() => setExpanded(!expanded)}>
        <div className="flex items-center gap-2.5">
          {icon}
          <div><p className="font-medium text-sm">{job.name}</p><p className="text-xs text-muted-foreground">{job.base_model}</p></div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right"><p className="text-sm font-medium">{job.progress || 0}%</p><p className="text-xs text-muted-foreground">{job.status}</p></div>
          {(job.status === "running" || job.status === "pending") && <Button variant="destructive" size="sm" onClick={(e) => { e.stopPropagation(); cancelMut.mutate(); }}>{t("lora.cancel")}</Button>}
          {job.status === "success" && !job.registered_model_id && <Button variant="outline" size="sm" onClick={(e) => { e.stopPropagation(); registerMut.mutate(); }}>{t("lora.register-model")}</Button>}
          {expanded ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
        </div>
      </div>
      <div className="h-0.5 bg-muted"><div className={`h-full transition-all duration-500 ${job.status === "failed" ? "bg-red-500" : job.status === "success" ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${job.progress || 0}%` }} /></div>
      {expanded && (
        <div className="p-3 border-t border-border">
          <h4 className="text-sm font-medium mb-1.5">{t("lora.training-logs")}</h4>
          <JobLogs jobId={job.id} />
          {job.status === "success" && job.registered_model_id && <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1.5">{t("lora.registered-model-id", { id: job.registered_model_id })}</p>}
        </div>
      )}
    </div>
  );
}

export default function LoRAPage() {
  const { t } = useTranslation();
  const [showCreate, setShowCreate] = useState(false);
  const { data: jobs = [] } = useQuery({ queryKey: ["finetune-jobs"], queryFn: () => finetuneApi.listJobs().then((r) => r.data), refetchInterval: 5000 });

  return (
    <div className="p-6 space-y-4">
      <div className="flex justify-end">
        <Button size="sm" className="gap-1.5" onClick={() => setShowCreate(true)}><Plus className="w-3.5 h-3.5" />{t("lora.new-job")}</Button>
      </div>
      {jobs.length === 0 ? (
        <EmptyState icon={<Cpu className="h-5 w-5 text-muted-foreground" />} title={t("lora.empty-title")} description={t("lora.empty-description")} action={{ label: t("lora.create-first"), onClick: () => setShowCreate(true) }} />
      ) : (
        <div className="space-y-2">{jobs.map((job: any) => <JobCard key={job.id} job={job} />)}</div>
      )}
      {showCreate && <CreateJobModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
