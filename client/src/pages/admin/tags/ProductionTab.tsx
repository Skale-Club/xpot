import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSearchParams } from "wouter";
import { ChevronRight, Plus, Printer, Shapes } from "lucide-react";
import { isBoughtPart, type PrintModelItem } from "@shared/printProduction";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/xpot/EmptyState";
import { FilterChips, FilterSearch } from "@/components/xpot/filters";
import { BackLink } from "@/components/xpot/PageHeader";
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
import { batchPrefixFromTitle, canPrintModel, orderedPath, productionPath, productionTabFor, slugFromTitle } from "./production-workflow";
import { ProductionIdentity, useModelName } from "./production-identity";

// Manage › Production (the Xpot admin's, docs/PRINT_EXECUTION_PLAN.md). The first screen is the board
// (production-board.tsx): always-ready pieces to download, pieces to generate and the plates waiting to print. Then
// the catalog of models. Paths: /admin/tags/production[/queue | /models[/<slug>] | /jobs/<id> |
// /batches/<id>] (/queue is the full orders list, history included, reached from the board's "All orders"; it lights Produce) (marking a plate printed puts its pieces in stock, so there is no receiving list).
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
  const tab = productionTabFor(view);
  // The lists behind the board have no tabs: a way back and their own name.
  if (view === "batches" && params.get("pending") === "1") return <div className="space-y-4" data-testid="admin-production"><PendingBatches go={navigate} /></div>;
  if (view === "queue") return <div className="space-y-4" data-testid="admin-production"><QueueView go={navigate} /></div>;
  return (
    <div className="space-y-4" data-testid="admin-production">
      <Tabs
        tabs={[
          { id: "board", label: b("produce"), testId: "production-tab-board" },
          { id: "catalog", label: u("models"), testId: "production-tab-catalog" },
        ]}
        value={tab}
        onChange={(next) => navigate(next === "catalog" ? `${PRODUCTION_BASE}/models` : PRODUCTION_BASE)}
        ariaLabel={t("productionNav")}
        idPrefix="production"
        fill={false}
        accent="tags"
      />
      {tab === "catalog" ? <CatalogView go={navigate} /> : <ProductionBoard go={navigate} onOtherWays={isAdmin ? () => setExternal(true) : undefined} />}
      {external ? <ProductionWizard external onClose={() => setExternal(false)} onCreated={(batchId) => navigate(`/batches/${batchId}?tab=receive`)} /> : null}
    </div>
  );
}

/// ─── Catalog ──────────────────────────────────────────────────────────────────

const PARTS = "parts";

function CatalogView({ go }: { go: Go }) {
  const t = useT(productionMessages);
  const labels = useTagLabels();
  const nameOf = useModelName();
  const { data, isLoading, error, refetch } = usePrintModels();
  const { isAdmin } = useProductionAccess();
  const [creating, setCreating] = useState(false);
  const [printing, setPrinting] = useState<PrintModelItem | null>(null);
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<string>("all");
  // A branch prints what is ready: models still without a design and deactivated ones are the platform's to deal with.
  const visible = (data ?? []).filter((model) => isAdmin || model.status === "ready");
  const needle = query.trim().toLowerCase();
  const matches = (model: PrintModelItem) => !needle || `${nameOf(model)} ${model.title}`.toLowerCase().includes(needle);
  const groupKey = (model: PrintModelItem) => (model.kind === "part" ? PARTS : model.productType ?? "custom");
  const live = visible.filter((model) => model.status === "ready" && matches(model) && (product === "all" || groupKey(model) === product));
  const groups = Array.from(new Set(live.map(groupKey))).map((key) => ({
    key,
    title: key === PARTS ? t("groupParts") : labels.product(key),
    items: live.filter((model) => groupKey(model) === key).sort((a, b) => a.sortOrder - b.sortOrder || nameOf(a).localeCompare(nameOf(b))),
  }));
  const folded = [
    { key: "design", title: t("groupNoDesign"), items: visible.filter((model) => model.status === "design_needed" && matches(model)) },
    { key: "retired", title: t("groupRetired"), items: visible.filter((model) => model.status === "retired" && matches(model)) },
  ].filter((group) => group.items.length > 0);
  const chips = [{ id: "all", label: t("filterAll") }, ...Array.from(new Set(visible.filter((m) => m.status === "ready").map(groupKey))).map((key) => ({ id: key, label: key === PARTS ? t("groupParts") : labels.product(key) }))];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-64"><FilterSearch value={query} onChange={setQuery} placeholder={t("searchModels")} testId="production-model-search" /></div>
        {isAdmin ? (
          <Button type="button" variant="brand" accent="tags" size="sm" onClick={() => setCreating(true)} data-testid="production-new-model">
            <Plus />
            {t("newModel")}
          </Button>
        ) : null}
      </div>
      {chips.length > 2 ? <FilterChips items={chips} value={product} onChange={setProduct} ariaLabel={t("fieldType")} accent="tags" /> : null}

      {error && !data ? (
        <LoadError what={t("catalogWhat")} error={error} onRetry={() => void refetch()} />
      ) : isLoading ? (
        <Loading rows={4} />
      ) : groups.length || folded.length ? (
        <>
          {groups.map((group) => (
            <section key={group.key} className="space-y-2">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-white/40">{group.title}</h2>
              <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((model) => (
                  <ModelCard key={model.id} model={model} onOpen={() => go(`${PRODUCTION_BASE}/models/${model.slug}`)} onPrint={() => setPrinting(model)} />
                ))}
              </ul>
            </section>
          ))}
          {folded.map((group) => (
            <details key={group.key} className="rounded-2xl border border-white/[0.08] p-3" data-testid={`production-models-${group.key}`}>
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/50">{group.title} ({group.items.length})</summary>
              <ul className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                {group.items.map((model) => (
                  <ModelCard key={model.id} model={model} onOpen={() => go(`${PRODUCTION_BASE}/models/${model.slug}`)} onPrint={() => setPrinting(model)} />
                ))}
              </ul>
            </details>
          ))}
        </>
      ) : data?.length && (needle || product !== "all") ? (
        <EmptyState tone="tags" icon={Shapes} title={t("noModelMatches")} />
      ) : (
        <EmptyState tone="tags" icon={Shapes} title={t("catalogEmpty")} hint={t("catalogEmptyHint")} />
      )}

      {creating && <NewModelDialog onClose={() => setCreating(false)} onCreated={(slug) => go(`${PRODUCTION_BASE}/models/${slug}`)} />}
      {printing && <PrintDialog model={printing} onClose={() => setPrinting(null)} onOrdered={(request) => go(orderedPath(request))} />}
    </div>
  );
}

function ModelCard({ model, onOpen, onPrint }: { model: PrintModelItem; onOpen: () => void; onPrint: () => void }) {
  const t = useT(productionMessages);
  const bought = isBoughtPart(model);
  const printable = canPrintModel(model);
  // The one badge a card needs: what stops it being printed, or what is wrong with its count.
  const badge = model.status === "design_needed" ? <ModelStatusPill status={model.status} />
    : model.status === "retired" ? <ModelStatusPill status={model.status} />
    : bought ? <Pill tone="slate">{t("modelBought")}</Pill>
    : null;
  return (
    <li className="flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3" data-testid="production-model-card">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <span className="min-w-0 flex-1 space-y-1">
          <ProductionIdentity model={model} />
          <span className="flex flex-wrap items-center gap-1.5 text-xs text-white/45">
            {badge}
            {model.lowStock ? <Pill tone="amber">{t("lowStock", { count: model.partReorderAt ?? 0 })}</Pill> : null}
            {model.onHand > 0 ? <span>{t("onHand", { count: model.onHand })}</span> : null}
            {model.openJobs ? <span>{t.plural("openOrders", model.openJobs)}</span> : null}
          </span>
        </span>
        {!printable ? <ChevronRight className="h-4 w-4 shrink-0 text-white/30" aria-hidden="true" /> : null}
      </button>
      {/* The same test as the Print dialog's list: a ready model with a generator (or a part's file) to print from. */}
      {printable ? (
        <Button type="button" variant="secondary" size="sm" onClick={onPrint} data-testid="production-print">
          <Printer />
          {t("print")}
        </Button>
      ) : null}
    </li>
  );
}

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PART_TYPE = "part";

function NewModelDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (slug: string) => void }) {
  const t = useT(productionMessages);
  const tc = useT(commonMessages);
  const labels = useTagLabels();
  const nameOf = useModelName();
  const { toast } = useToast();
  const { data: catalog = [] } = useTagCatalog();
  const themeOptions = useThemeOptions();
  const [form, setForm] = useState({ type: "", title: "", slug: "", face: "", theme: "", salesProductId: "", batchPrefix: "", description: "" });
  // The name, the short name and the batch prefix follow what was picked until the person types in them (emptying one hands it back).
  const [typed, setTyped] = useState({ title: false, slug: false, batchPrefix: false });
  const [advanced, setAdvanced] = useState(false);
  const part = form.type === PART_TYPE;
  const serialized = Boolean(form.type) && !part;
  const update = (patch: Partial<typeof form>) => setForm((current) => {
    const next = { ...current, ...patch };
    const title = typed.title ? next.title : next.type && next.type !== PART_TYPE ? nameOf({ title: "", productType: next.type, face: next.face || null, theme: next.theme || null }) : next.title;
    return {
      ...next,
      title,
      ...(typed.slug ? {} : { slug: slugFromTitle(title) }),
      ...(typed.batchPrefix ? {} : { batchPrefix: batchPrefixFromTitle(title) }),
    };
  });
  // Typing the name takes it over from the picks; emptying it hands it back.
  const setTitle = (title: string) => {
    setTyped({ ...typed, title: title !== "" });
    setForm((current) => ({
      ...current,
      title,
      ...(typed.slug ? {} : { slug: slugFromTitle(title) }),
      ...(typed.batchPrefix ? {} : { batchPrefix: batchPrefixFromTitle(title) }),
    }));
  };
  const slug = form.slug.trim().toLowerCase();
  // A serialized model needs everything "Generate pieces" asks for (shared SERIALIZED_MODEL_FIELDS): product, face,
  // colour, sales product and batch prefix; the last two come with the name, unless they are already taken.
  const missing = [
    !form.type && t("fieldType"),
    serialized && !form.face && t("fieldFace"),
    serialized && !form.theme && t("fieldTheme"),
    serialized && !form.salesProductId && t("fieldSoldAs"),
    !form.title.trim() && t("fieldTitle"),
  ].filter(Boolean) as string[];
  const ready = missing.length === 0 && SLUG.test(slug) && (!serialized || form.batchPrefix.trim());
  const save = useMutation({
    mutationFn: () =>
      sendJson<PrintModelItem>("POST", "/api/xpot/admin/print-models", {
        slug,
        kind: part ? "part" : "serialized",
        title: form.title,
        description: form.description,
        theme: form.theme || null,
        ...(serialized
          ? { productType: form.type, face: form.face || null, salesProductId: Number(form.salesProductId), batchPrefix: form.batchPrefix }
          : {}),
      }),
    onSuccess: async (model) => {
      await invalidateAdminTags();
      toast({ title: t("modelCreated") });
      onClose();
      onCreated(model.slug);
    },
    onError: (err) => {
      // Most likely the short name or the batch prefix is taken: show them.
      setAdvanced(true);
      toast({ title: t("couldNotSaveModel"), description: errorMessage(err), variant: "destructive" });
    },
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[min(92dvh,760px)] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-white/[0.08] px-5 py-4 pr-14">
          <DialogTitle>{t("newModel")}</DialogTitle>
          <DialogDescription>{t("newModelDesc")}</DialogDescription>
        </DialogHeader>
        <div className="grid min-h-0 flex-1 gap-3 overflow-y-auto p-5 sm:grid-cols-2">
          <Field label={t("fieldType")} required className="sm:col-span-2">
            <Select
              value={form.type}
              onChange={(e) => update({ type: e.target.value })}
              placeholder={t("choose")}
              options={[...labels.productOptions, { value: PART_TYPE, label: t("typePart") }]}
              data-testid="production-model-type"
            />
          </Field>
          {serialized && (
            <>
              <Field label={t("fieldFace")} required>
                <Select value={form.face} onChange={(e) => update({ face: e.target.value })} placeholder={t("choose")} options={labels.faceOptions} data-testid="production-model-face" />
              </Field>
              <Field label={t("fieldTheme")} required>
                <Select value={form.theme} onChange={(e) => update({ theme: e.target.value })} placeholder={t("choose")} options={themeOptions} data-testid="production-model-theme" />
              </Field>
              <Field label={t("fieldSoldAs")} hint={t("fieldSoldAsHint")} required className="sm:col-span-2">
                <Select value={form.salesProductId} onChange={(e) => update({ salesProductId: e.target.value })} placeholder={t("choose")} options={catalogOptions(catalog)} />
              </Field>
            </>
          )}
          {part ? (
            <Field label={t("fieldTheme")}>
              <Select value={form.theme} onChange={(e) => update({ theme: e.target.value })} placeholder={t("choose")} options={themeOptions} data-testid="production-model-theme" />
            </Field>
          ) : null}
          <Field label={t("fieldTitle")} required className="sm:col-span-2">
            <Input value={form.title} maxLength={120} onChange={(e) => setTitle(e.target.value)} data-testid="production-model-title" />
          </Field>
          <Field label={t("fieldDescription")} className="sm:col-span-2">
            <Textarea value={form.description} rows={2} maxLength={2000} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <details open={advanced} onToggle={(e) => setAdvanced(e.currentTarget.open)} className="rounded-xl border border-white/[0.08] p-3 sm:col-span-2">
            <summary className="cursor-pointer text-xs font-semibold text-white/55">{t("advanced")}</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label={t("fieldSlug")} hint={t("fieldSlugHint")} required error={form.slug && !SLUG.test(slug) ? t("fieldSlugInvalid") : undefined}>
                <Input value={form.slug} maxLength={80} spellCheck={false} className="font-mono" placeholder="plate-large-menu-white" onChange={(e) => { setTyped({ ...typed, slug: e.target.value !== "" }); setForm({ ...form, slug: e.target.value }); }} />
              </Field>
              {serialized ? (
                <Field label={t("fieldBatchPrefix")} hint={t("fieldBatchPrefixHint")} required>
                  <Input value={form.batchPrefix} maxLength={12} className="font-mono uppercase" placeholder="LPLATE" onChange={(e) => { setTyped({ ...typed, batchPrefix: e.target.value !== "" }); setForm({ ...form, batchPrefix: e.target.value }); }} />
                </Field>
              ) : null}
            </div>
          </details>
        </div>
        <DialogFooter className="shrink-0 items-center gap-2 border-t border-white/[0.08] px-5 py-3">
          {missing.length ? <p className="mr-auto text-xs text-white/50" data-testid="production-model-missing">{t("fillIn", { fields: missing.join(", ") })}</p> : null}
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
  // The board shows what is open; this list is for the rest, so it opens on everything.
  const [filter, setFilter] = useState<JobFilter>("all");
  // The owners see every organization's requests: narrow to one when branches print too.
  const { isAdmin, organizations } = useProductionAccess();
  const [organization, setOrganization] = useState("");
  return (
    <div className="space-y-4">
      <BackLink onBack={() => go(PRODUCTION_BASE)}>{u("title")}</BackLink>
      <h1 className="text-2xl font-semibold tracking-tight text-white">{t("tabQueue")}</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
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
            { id: "all", label: t("filterAll") },
            { id: "open", label: t("filterOpen") },
            { id: "done", label: t("filterDone") },
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
