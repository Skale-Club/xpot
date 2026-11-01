import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { ChevronRight, Plus, Printer, Shapes } from "lucide-react";
import type { PrintModelItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { Field, Input, Select, Textarea } from "@/components/xpot/Field";
import { Tabs } from "@/components/xpot/Tabs";
import { Pill } from "@/components/xpot/StatusPill";
import { useToast } from "@/hooks/use-toast";
import { useT } from "@/i18n";
import { commonMessages } from "@/i18n/messages/common";
import { productionMessages } from "@/i18n/messages/production";
import { productionBoardMessages } from "@/i18n/messages/productionBoard";
import { unifiedProductionMessages } from "@/i18n/messages/unifiedProduction";
import { errorMessage, invalidateAdminTags, sendJson } from "./api";
import { catalogOptions, useTagCatalog } from "./batches-shared";
import { useTagLabels } from "./labels";
import { Loading, LoadError } from "./pieces-shared";
import { PrintModelPage } from "./production-model";
import { PrintJobPage } from "./production-job";
import { PrintDialog, RequestList } from "./production-orders";
import { ModelStatusPill, PRODUCTION_BASE, bedSummary, usePrintModels, useProductionAccess, useThemeOptions, type JobFilter } from "./production-shared";
import { BatchDetail } from "./BatchDetail";
import { ProductionWizard } from "./production-wizard";
import { ProductionBoard } from "./production-board";
import { PendingBatches } from "./production-pending-batches";
import { batchPrefixFromTitle, canPrintModel, productionPath, slugFromTitle } from "./production-workflow";
import { ProductionIdentity } from "./production-identity";

// Manage › Production (the Xpot admin's, docs/PRINT_EXECUTION_PLAN.md). The first screen is the board
// (production-board.tsx): always-ready pieces to download, pieces to generate and the plates waiting to print. Then
// the orders and the catalog of models. Paths: /admin/tags/production[/queue | /models[/<slug>] | /jobs/<id> |
// /batches/<id>] (marking a plate printed puts its pieces in stock, so there is no receiving list).
// A printing branch's Rep Admin sees the same page for that branch: generating and printing its pieces, without
// always-ready parts, supplier batches or editing models (useProductionAccess; the server scopes every call).

type Go = (path: string) => void;

export function ProductionTab({ rest, go }: { rest: string[]; go: Go }) {
  const t = useT(productionMessages);
  const u = useT(unifiedProductionMessages);
  const b = useT(productionBoardMessages);
  const { isAdmin } = useProductionAccess();
  // Supplier codes and pieces that already have codes: the wizard's other ways, behind a small link on the board.
  const [external, setExternal] = useState(false);
  const [params] = useSearchParams();
  const [view, id] = rest;
  const navigate = (path: string) => go(productionPath(path));
  if (view === "models" && id) return <PrintModelPage slug={id} go={navigate} />;
  if (view === "jobs" && id) return <PrintJobPage id={id} go={navigate} />;
  if (view === "batches" && id) return <BatchDetail id={id} go={navigate} />;
  const tab = view === "models" ? "catalog" : view === "queue" || view === "batches" ? "queue" : "board";
  return (
    <div className="space-y-4" data-testid="admin-production">
      <header className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight text-white">{u("title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-white/50">{b("intro")}</p>
      </header>
      <Tabs
        tabs={[
          { id: "board", label: b("produce"), testId: "production-tab-board" },
          { id: "queue", label: u("requests"), testId: "production-tab-queue" },
          { id: "catalog", label: u("models"), testId: "production-tab-catalog" },
        ]}
        value={tab}
        onChange={(next) => navigate(next === "catalog" ? `${PRODUCTION_BASE}/models` : next === "queue" ? `${PRODUCTION_BASE}/queue` : PRODUCTION_BASE)}
        ariaLabel={t("productionNav")}
        idPrefix="production"
        fill={false}
        accent="tags"
      />
      {tab === "catalog" ? <CatalogView go={navigate} /> : view === "batches" && params.get("pending") === "1" ? <PendingBatches go={navigate} /> : tab === "queue" ? <QueueView go={navigate} /> : <ProductionBoard go={navigate} onOtherWays={isAdmin ? () => setExternal(true) : undefined} />}
      {external ? <ProductionWizard external onClose={() => setExternal(false)} onCreated={(batchId) => navigate(`/batches/${batchId}?tab=receive`)} /> : null}
    </div>
  );
}

// ─── Catalog ──────────────────────────────────────────────────────────────────

function CatalogView({ go }: { go: Go }) {
  const t = useT(productionMessages);
  const { data, isLoading, error, refetch } = usePrintModels();
  const { isAdmin } = useProductionAccess();
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
        {isAdmin ? (
          <Button type="button" variant="brand" accent="tags" size="sm" onClick={() => setCreating(true)} data-testid="production-new-model">
            <Plus />
            {t("newModel")}
          </Button>
        ) : null}
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
      {printing && <PrintDialog model={printing} onClose={() => setPrinting(null)} onOrdered={() => go(`${PRODUCTION_BASE}/queue`)} />}
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
        <span className="min-w-0 flex-1">
          <ProductionIdentity model={model} />
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
        {/* The same test as the Print dialog's list: a ready model with a generator (or a part's file) to print from. */}
        <Button type="button" variant="secondary" size="sm" disabled={!canPrintModel(model)} onClick={onPrint} data-testid="production-print">
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
  const themeOptions = useThemeOptions();
  const [form, setForm] = useState({ kind: "serialized", title: "", slug: "", productType: "", face: "", theme: "", salesProductId: "", batchPrefix: "", description: "" });
  // The slug and the batch prefix follow the title until the person types in them (emptying one hands it back).
  const [typed, setTyped] = useState({ slug: false, batchPrefix: false });
  const setTitle = (title: string) => setForm((f) => ({
    ...f,
    title,
    ...(typed.slug ? {} : { slug: slugFromTitle(title) }),
    ...(typed.batchPrefix ? {} : { batchPrefix: batchPrefixFromTitle(title) }),
  }));
  const serialized = form.kind === "serialized";
  const slug = form.slug.trim().toLowerCase();
  // A serialized model needs everything "Generate pieces" asks for (shared SERIALIZED_MODEL_FIELDS): product, face,
  // colour, sales product and batch prefix.
  const ready = form.title.trim() && SLUG.test(slug) &&
    (!serialized || (form.productType && form.face && form.theme && form.salesProductId && form.batchPrefix.trim()));
  const save = useMutation({
    mutationFn: () =>
      sendJson<PrintModelItem>("POST", "/api/xpot/admin/print-models", {
        slug,
        kind: form.kind,
        title: form.title,
        description: form.description,
        theme: form.theme || null,
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
      <DialogContent className="max-w-xl">
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
          <Field label={t("fieldTheme")} required={serialized}>
            <Select value={form.theme} onChange={(e) => setForm({ ...form, theme: e.target.value })} placeholder={t("choose")} options={themeOptions} data-testid="production-model-theme" />
          </Field>
          <Field label={t("fieldTitle")} required className="sm:col-span-2">
            <Input value={form.title} maxLength={120} onChange={(e) => setTitle(e.target.value)} data-testid="production-model-title" />
          </Field>
          <Field label={t("fieldSlug")} hint={t("fieldSlugHint")} required className="sm:col-span-2" error={form.slug && !SLUG.test(slug) ? t("fieldSlugInvalid") : undefined}>
            <Input value={form.slug} maxLength={80} spellCheck={false} className="font-mono" placeholder="plate-large-menu-white" onChange={(e) => { setTyped({ ...typed, slug: e.target.value !== "" }); setForm({ ...form, slug: e.target.value }); }} />
          </Field>
          {serialized && (
            <>
              <Field label={t("fieldProduct")} required>
                <Select value={form.productType} onChange={(e) => setForm({ ...form, productType: e.target.value })} placeholder={t("choose")} options={labels.productOptions} />
              </Field>
              <Field label={t("fieldFace")} required>
                <Select value={form.face} onChange={(e) => setForm({ ...form, face: e.target.value })} placeholder={t("choose")} options={labels.faceOptions} data-testid="production-model-face" />
              </Field>
              <Field label={t("fieldSalesProduct")} required>
                <Select value={form.salesProductId} onChange={(e) => setForm({ ...form, salesProductId: e.target.value })} placeholder={t("choose")} options={catalogOptions(catalog)} />
              </Field>
              <Field label={t("fieldBatchPrefix")} hint={t("fieldBatchPrefixHint")} required>
                <Input value={form.batchPrefix} maxLength={12} className="font-mono uppercase" placeholder="LPLATE" onChange={(e) => { setTyped({ ...typed, batchPrefix: e.target.value !== "" }); setForm({ ...form, batchPrefix: e.target.value }); }} />
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
  const u = useT(unifiedProductionMessages);
  const [filter, setFilter] = useState<JobFilter>("open");
  // The owners see every organization's requests: narrow to one when branches print too.
  const { isAdmin, organizations } = useProductionAccess();
  const [organization, setOrganization] = useState("");
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="min-w-0 max-w-2xl text-sm text-white/60">{u("queueIntro")}</p>
        {isAdmin && organizations.length > 1 ? (
          <Select
            value={organization}
            onChange={(e) => setOrganization(e.target.value)}
            aria-label={t("organization")}
            options={[{ value: "", label: t("allOrganizations") }, ...organizations.map((o) => ({ value: String(o.id), label: o.name }))]}
            className="w-auto"
            data-testid="production-organization-filter"
          />
        ) : null}
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
      <RequestList filter={filter} organization={organization ? Number(organization) : undefined} go={go} />
    </div>
  );
}
