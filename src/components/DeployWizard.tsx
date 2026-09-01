import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { StorageNotice } from "@/components/StorageNotice";
import { WizardProgress } from "@/components/wizard/WizardProgress";
import { StepFile } from "@/components/wizard/StepFile";
import { StepUser } from "@/components/wizard/StepUser";
import { StepUpload } from "@/components/wizard/StepUpload";
import { StepCheck } from "@/components/wizard/StepCheck";
import { StepHosting } from "@/components/wizard/StepHosting";
import { StepAppSetup } from "@/components/wizard/StepAppSetup";
import { StepDone } from "@/components/wizard/StepDone";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  clearDraft,
  getProfile,
  getProject,
  getAppConfig,
  loadDraft,
  publish,
  saveDraft,
  saveOwnerName,
  saveAppConfig,
} from "@/services/deploymentApi";
import { normalizeSlug } from "@/lib/deployment/domain";
import { DEFAULT_ADVANCED } from "@/types/deployment";
import { createDefaultAppConfig } from "@/lib/app-config/config";
import type { AppRuntimeConfig } from "@/types/appConfig";
import type {
  AdvancedOptions,
  AppProject,
  CodeCheckReport,
  HostingTargetId,
  UploadedFile,
  Visibility,
} from "@/types/deployment";

export function DeployWizard({ projectId }: { projectId?: string | undefined }) {
  const [step, setStep] = useState(1);
  const [rawFile, setRawFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [ownerName, setOwnerName] = useState("");
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("link");
  const [hosting, setHosting] = useState<HostingTargetId>("auto");
  const [advanced, setAdvanced] = useState<AdvancedOptions>({ ...DEFAULT_ADVANCED });
  const [appConfig, setAppConfig] = useState<AppRuntimeConfig>(() => createDefaultAppConfig());
  const [report, setReport] = useState<CodeCheckReport | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [project, setProject] = useState<AppProject | null>(null);
  const [loadingProject, setLoadingProject] = useState(!!projectId);
  const [draftRestored, setDraftRestored] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let alive = true;
    const draft = loadDraft();
    if (draft && !projectId) {
      setOwnerName(draft.ownerName);
      setTitle(draft.title);
      setSlug(draft.slug);
      setVisibility(draft.visibility);
      setHosting(draft.hosting);
      setAdvanced({ ...DEFAULT_ADVANCED, ...draft.advanced });
      if (draft.title || draft.ownerName) setDraftRestored(true);
    }
    void getProfile().then((profile) => {
      if (!alive || !profile.ownerName) return;
      setOwnerName((prev) => prev || profile.ownerName);
    });
    setHydrated(true);
    return () => { alive = false; };
  }, [projectId]);

  useEffect(() => {
    if (!hydrated || step >= 7) return;
    saveDraft({ ownerName, title, slug, visibility, hosting, advanced, projectId: project?.id ?? projectId ?? null });
  }, [hydrated, step, ownerName, title, slug, visibility, hosting, advanced, project, projectId]);

  useEffect(() => {
    if (!projectId) return;
    let alive = true;
    setLoadingProject(true);
    getProject(projectId)
      .then((existing) => {
        if (!alive) return;
        setProject(existing);
        setOwnerName(existing.ownerName);
        setTitle(existing.title);
        setSlug(existing.slug);
        setVisibility(existing.visibility);
        setHosting(existing.hosting);
        setAdvanced({ ...DEFAULT_ADVANCED, ...existing.advanced });
        void getAppConfig(existing.id).then((config) => alive && setAppConfig(config)).catch(() => undefined);
      })
      .catch(() => alive && setPublishError("Приложение не найдено. Можно разместить его заново."))
      .finally(() => alive && setLoadingProject(false));
    return () => { alive = false; };
  }, [projectId]);

  const validReport = report && uploaded && report.uploadId === uploaded.id ? report : null;
  const activeProjectId = project?.id ?? projectId ?? null;

  function reset() {
    clearDraft(); setDraftRestored(false); setTitle(""); setSlug(""); setRawFile(null); setUploaded(null);
    setReport(null); setPublishError(null); setProject(null); setStep(1);
  }

  async function doPublish() {
    if (!uploaded || !validReport) return;
    setPublishing(true); setPublishError(null);
    try {
      await saveOwnerName(ownerName.trim());
      const { project: created } = await publish({
        file: uploaded, report: validReport, ownerName: ownerName.trim(), title: title.trim(), slug,
        visibility, hosting, advanced, projectId: activeProjectId,
      });
      setProject(created);
      try { await saveAppConfig(created.id, appConfig); }
      catch (configError) { console.error("Не удалось сохранить настройки приложения", configError); }
      clearDraft(); setDraftRestored(false); setStep(7);
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : "Не удалось разместить приложение");
    } finally { setPublishing(false); }
  }

  return <div className="min-h-screen bg-background">
    <AppHeader />
    <main className="mx-auto max-w-2xl space-y-5 px-4 py-6 sm:py-8">
      <StorageNotice /><WizardProgress current={step} />
      {draftRestored && step === 1 && <div className="rounded-xl border border-border bg-muted p-3 text-xs">Мы восстановили черновик: название и настройки сохранены. Выберите файл, чтобы продолжить.</div>}
      {loadingProject && <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-3 text-xs"><Loader2 className="h-4 w-4 animate-spin text-primary" /> Загружаем данные приложения…</div>}
      {project && step < 7 && <div className="rounded-xl border border-border bg-primary-soft p-3 text-xs">Обновление приложения «{project.title}» — новая версия добавится к нему, адрес {project.url} не изменится.</div>}

      {step === 1 && <StepFile file={rawFile} onFile={(f) => { setRawFile(f); setUploaded(null); setReport(null); setPublishError(null); if (f && !title) { const base = f.name.replace(/\.(html|htm|zip)$/i, ""); setTitle(base); setSlug(normalizeSlug(base)); } }} onNext={() => setStep(2)} />}
      {step === 2 && <StepUser ownerName={ownerName} title={title} slug={slug} visibility={visibility} projectId={activeProjectId} onChange={(patch) => { if (patch.ownerName !== undefined) setOwnerName(patch.ownerName); if (patch.title !== undefined) setTitle(patch.title); if (patch.slug !== undefined) setSlug(patch.slug); if (patch.visibility !== undefined) setVisibility(patch.visibility); }} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && rawFile && <StepUpload file={rawFile} uploaded={uploaded} onDone={(file) => { setUploaded(file); setStep(4); }} onBack={() => setStep(2)} />}
      {step === 4 && uploaded && <StepCheck file={uploaded} projectId={activeProjectId} report={validReport} onReport={setReport} onBack={() => setStep(2)} onNext={() => setStep(5)} />}
      {step === 5 && <StepAppSetup value={appConfig} onChange={setAppConfig} onBack={() => setStep(4)} onNext={() => setStep(6)} />}
      {step === 6 && <div className="space-y-4">
        {publishError && <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertTitle>Размещение не удалось</AlertTitle><AlertDescription className="space-y-3"><p>{publishError}</p><div className="flex flex-col gap-2 sm:flex-row"><Button size="sm" variant="outline" onClick={doPublish} disabled={publishing}><RotateCcw className="mr-2 h-4 w-4" /> Попробовать снова</Button><Button size="sm" variant="ghost" onClick={reset}>Выбрать другой файл</Button></div></AlertDescription></Alert>}
        <StepHosting hosting={hosting} advanced={advanced} publishing={publishing} onChange={(patch) => { if (patch.hosting) setHosting(patch.hosting); if (patch.advanced) setAdvanced(patch.advanced); }} onBack={() => setStep(5)} onPublish={doPublish} />
      </div>}
      {step === 7 && project && <StepDone project={project} onNewVersion={() => { setRawFile(null); setUploaded(null); setReport(null); setPublishError(null); setStep(1); }} />}
      {((step === 3 && !rawFile) || (step === 4 && !uploaded) || (step === 7 && !project)) && <div className="rounded-2xl border border-border bg-card p-6 text-center"><p className="text-sm text-muted-foreground">Начните с выбора файла.</p><Button className="mt-3 h-12" onClick={reset}>К первому шагу</Button></div>}
      <p className="text-center text-xs text-muted-foreground"><Link to="/apps" className="underline">Мои приложения</Link></p>
    </main>
  </div>;
}
