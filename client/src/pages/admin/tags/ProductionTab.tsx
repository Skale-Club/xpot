import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronRight, Plus, Printer, Shapes } from "lucide-react";
import type { PrintModelItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { Tabs } from "@/components/xpot/Tabs";
import { TagFaceIcon } from "@/components/xpot/TagFaceIcon";
import { Pill } from "@/components/xpot/StatusPill";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { catalogOptions, useTagCatalog } from "./batches-shared";
import { useTagLabels } from "./labels";
import { Loading, LoadError } from "./pieces-shared";
import { PrintModelPage } from "./production-model";
import { PrintJobPage } from "./production-job";
import { JobList, PrintDialog } from "./production-orders";
import { ModelStatusPill, PRODUCTION_BASE, PrinterCards, bedSummary, usePrintModels, type JobFilter } from "./production-shared";

// Manage › Production (the Xpot admin's, docs/PRINT_EXECUTION_PLAN.md): the catalog of what the house prints and
// the queue of print orders. Paths: /admin/tags/production[/queue | /models/<slug> | /jobs/<id>].

type Go = (path: string) => void;

export function ProductionTab({ rest, go }: { rest: string[]; go: Go }) {
  const t = useT(productionMessages);
  const [view, id] = rest;
  if (view === "models" && id) return <PrintModelPage slug={id} go={go} />;
  if (view === "jobs" && id) return <PrintJobPage id={id} go={go} />;
  const tab = view === "queue" ? "queue" : "catalog";
  return (
    <div className="space-y-4" data-testid="admin-production">
      <Tabs
        tabs={[
          { id: "catalog", label: t("tabCatalog"), testId: "production-tab-catalog" },
          { id: "queue", label: t("tabQueue"), testId: "production-tab-queue" },
        ]}
        value={tab}
        onChange={(next) => go(next === "queue" ? `${PRODUCTION_BASE}/queue` : PRODUCTION_BASE)}
        ariaLabel={t("productionNav")}
        idPrefix="production"
        fill={false}
        accent="tags"
      />
      {tab === "catalog" ? <CatalogView go={go} /> : <QueueView go={go} />}
    </div>
  );
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

function CatalogView({ go }: { go: Go }) {
  const t = useT(productionMessages);
  const { data, isLoading, error, refetch } = usePrintModels();
  const [creating, setCreating] = useState(false);
  const [printing, setPrinting] = useState<PrintModelItem | null>(null);
  const groups = [
    { key: "serialized", title: t("groupSerialized"), items: (data ?? []).filter((m) => m.kind === "serialized" && m.status !== "retired") },
    { key: "parts", title: t("groupParts"), items: (data ?? []).filter((m) => m.kind === "part" && m.status !== "retired") },
    { key: "retired", title: t("groupRetired"), items: (data ?? []).filter((m) => m.status === "retired") },
  ].filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 max-w-2xl text-sm text-white/60">{t("catalogIntro")}</p>
        <Button type="button" variant="brand" accent="tags" size="sm" onClick={() => setCreating(true)} data-testid="production-new-model">
          <Plus />
          {t("newModel")}
        </Button>
      </div>

      {error && !data ? (
        <LoadError what={t("catalogWhat")} error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Loading rows={4} />
      ) : groups.length ? (
        groups.map((group) => (
          <section key={group.key} className="space-y-2">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">{group.title}</h2>
            <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
              {group.items.map((model) => (
                <ModelCard key={model.id} model={model} onOpen={() => go(`${PRODUCTION_BASE}/models/${model.slug}`)} onPrint={() => setPrinting(model)} />
              ))}
            </ul>
          </section>
        ))
      ) : (
        <EmptyState tone="tags" icon={Shapes} title={t("catalogEmpty")} hint={t("catalogEmptyHint")} />
      )}

      {creating && <NewModelDialog onClose={() => setCreating(false)} onCreated={(slug) => go(`${PRODUCTION_BASE}/models/${slug}`)} />}
      {printing && <PrintDialog model={printing} onClose={() => setPrinting(null)} onOrdered={(job) => go(`${PRODUCTION_BASE}/jobs/${job.id}`)} />}
    </div>
  );
}

function ModelCard({ model, onOpen, onPrint }: { model: PrintModelItem; onOpen: () => void; onPrint: () => void }) {
  const t = useT(productionMessages);
  const version = model.currentVersion;
  const bed = version?.beds[0];
  return (
    <li className="flex flex-col gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3" data-testid="production-model-card">
      <button type="button" onClick={onOpen} className="flex min-w-0 items-start gap-3 text-left">
        {model.kind === "serialized" ? <TagFaceIcon face={model.face} size="md" /> : <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5"><Shapes className="h-4 w-4 text-white/40" aria-hidden="true" /></span>}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-white">{model.title}</span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-white/45">
            <ModelStatusPill status={model.status} />
            {model.lowStock ? <Pill tone="amber">{t("lowStock", { count: model.partReorderAt ?? 0 })}</Pill> : null}
            {version ? <span>v{version.version}</span> : null}
            {bed ? <span className="truncate">{bedSummary(bed, t)}</span> : null}
          </span>
        </span>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/30" aria-hidden="true" />
      </button>
      <div className="flex items-center justify-between gap-2 border-t border-white/[0.06] pt-2 text-xs text-white/50">
        <span>
          {t("onHand", { count: model.onHand })}
          {model.openJobs ? ` · ${t.plural("openOrders", model.openJobs)}` : ""}
        </span>
        <Button type="button" variant="secondary" size="sm" disabled={model.status !== "ready"} onClick={onPrint} data-testid="production-print">
          <Printer />
          {t("print")}
        </Button>
      </div>
    </li>
  );
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function NewModelDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const t = useT(productionMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const { toast } = useToast();
  const { data: catalog = [] } = useTagCatalog();
  const [form, setForm] = useState({ kind: "serialized", title: "", slug: "", productType: "", face: "", theme: "", salesProductId: "", batchPrefix: "", description: "" });
  const serialized = form.kind === "serialized";
  const slug = form.slug.trim().toLowerCase();
  const ready = form.title.trim() && SLUG.test(slug) && (!serialized || (form.productType && form.salesProductId && form.batchPrefix.trim()));
  const save = useMutation({
    mutationFn: () =>
      sendJson<PrintModelItem>("POST", "/api/xpot/admin/print-models", {
        slug,
        kind: form.kind,
        title: form.title,
        description: form.description,
        theme: form.theme,
        ...(serialized
          ? { productType: form.productType, face: form.face || null, salesProductId: Number(form.salesProductId), batchPrefix: form.batchPrefix }
          : {}),
      }),
    onSuccess: async (model) => {
      await invalidateAdminTags();
      toast({ title: t("modelCreated") });
      onClose();
      onCreated(model.slug);
    },
    onError: (err) => toast({ title: t("couldNotSaveModel"), description: errorMessage(err), variant: "destructive" }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("newModel")}</DialogTitle>
          <DialogDescription>{t("newModelDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("fieldKind")}>
            <Select
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value })}
              options={[
                { value: "serialized", label: t("kindSerialized") },
                { value: "part", label: t("kindPart") },
              ]}
            />
          </Field>
          <Field label={t("fieldTheme")} hint={t("fieldThemeHint")}>
            <Input value={form.theme} maxLength={40} onChange={(e) => setForm({ ...form, theme: e.target.value })} />
          </Field>
          <Field label={t("fieldTitle")} required className="sm:col-span-2">
            <Input value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} data-testid="production-model-title" />
          </Field>
          <Field label={t("fieldSlug")} hint={t("fieldSlugHint")} required className="sm:col-span-2" error={form.slug && !SLUG.test(slug) ? t("fieldSlugInvalid") : undefined}>
            <Input value={form.slug} maxLength={80} spellCheck={false} className="font-mono" placeholder="plate-large-menu-white" onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </Field>
          {serialized && (
            <>
              <Field label={t("fieldProduct")} required>
                <Select value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} placeholder={t("choose")} options={labels.productOptions} />
              </Field>
              <Field label={t("fieldFace")}>
                <Select value={form.face} onChange={(e) => setForm({ ...form, face: e.target.value })} placeholder={t("choose")} options={labels.faceOptions} />
              </Field>
              <Field label={t("fieldSalesProduct")} required>
                <Select value={form.salesProductId} onChange={(e) => setForm({ ...form, salesProductId: e.target.value })} placeholder={t("choose")} options={catalogOptions(catalog)} />
              </Field>
              <Field label={t("fieldBatchPrefix")} hint={t("fieldBatchPrefixHint")} required>
                <Input value={form.batchPrefix} maxLength={12} className="font-mono uppercase" placeholder="LPLATE" onChange={(e) => setForm({ ...form, batchPrefix: e.target.value })} />
              </Field>
            </>
          )}
          <Field label={t("fieldDescription")} className="sm:col-span-2">
            <Textarea value={form.description} rows={3} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button type="button" variant="brand" accent="tags" disabled={!ready} loading={save.isPending} onClick={() => save.mutate()} data-testid="production-model-save">
            {tc("save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Queue ────────────────────────────────────────────────────────────────────

function QueueView({ go }: { go: Go }) {
  const t = useT(productionMessages);
  const [filter, setFilter] = useState<JobFilter>("open");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 max-w-2xl text-sm text-white/60">{t("queueIntro")}</p>
        <Tabs
          tabs={[
            { id: "open", label: t("filterOpen") },
            { id: "done", label: t("filterDone") },
            { id: "all", label: t("filterAll") },
          ]}
          value={filter}
          onChange={(next) => setFilter(next as JobFilter)}
          ariaLabel={t("tabQueue")}
          idPrefix="production-queue"
          fill={false}
          accent="tags"
        />
      </div>
      <PrinterCards />
      <JobList filter={filter} go={go} />
    </div>
  );
}
