import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useLocation } from "wouter";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, ClipboardList, Plus } from "lucide-react";
import { useT, type Dictionary } from "@/i18n";
import { customerOrdersMessages } from "@/i18n/messages/customerOrders";
import { printNfcMessages } from "@/i18n/messages/printNfc";
import { Button } from "@/components/ui/button";
import { CARD, INPUT, TopBar } from "./ui";
import LeadPicker, { type LeadChoice } from "./LeadPicker";
import type {
  CustomerOrder,
  OrderPage,
  OrderCatalog,
  OrderLine,
} from "@shared/customerOrdersApi";
import { TAG_PRODUCT_TYPES } from "@shared/tags";
import { TAG_FACES } from "@shared/tagFace";
import { PRINT_DEFAULT_NFC_MOUNT, PRINT_MAX_PLATES, PRINT_NFC_MOUNTS } from "@shared/printProduction";
import { tagsMessages } from "@/i18n/messages/tags";
import { TagPieceVisual } from "@/components/xpot/TagProductThumbnail";
import { useXpotModules } from "@/components/ModuleSwitch";
import { retainOrderCommand, type OrderCommandAttempt } from "./orderCommands";

const BASE = "/api/xpot/customer-orders";
const WORK_WORDS = new Set([
  "queued",
  "production",
  "ready",
  "delivered",
  "cancelled",
  "partially_cancelled",
  "artwork",
]);
const HISTORY_WORDS = new Set([
  "created",
  "allocated",
  "production_requested",
  "delivered",
  "changed",
  "cancelled",
  "released",
  "dispatched",
  "payment_recorded",
  "delivery_payment",
  "delivery_reversed",
  "artwork_added",
  "artwork_approved",
  "model_linked",
]);
const ART_WORDS = new Set(["approved", "proposed", "superseded"]);
const useOrdersT = () =>
  useT(customerOrdersMessages as Dictionary<Record<string, string>>);
type T = ReturnType<typeof useOrdersT>;
type Fields = Record<string, unknown>;
class RequestError extends Error {
  constructor(public code: string) {
    super(code);
  }
}
async function api<T>(url: string, body?: unknown, key?: string): Promise<T> {
  const res = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    credentials: "include",
    headers:
      body === undefined
        ? undefined
        : { "Content-Type": "application/json", "Idempotency-Key": key! },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new RequestError(data.code ?? "order_failed");
  return data;
}
function errorText(error: unknown, t: T) {
  const code = error instanceof RequestError ? error.code : "";
  if (code === "order_revision_conflict") return t("conflict");
  if (/forbidden|owner_required|not_found/.test(code)) return t("forbidden");
  if (/credit|payment|cost_required/.test(code)) return t("moneyError");
  if (/design_locked|release_before|price_locked/.test(code))
    return t("locked");
  if (/artwork|preview|model|design_changed/.test(code))
    return t("designError");
  if (/piece|quantity_exceeded/.test(code)) return t("stockError");
  if (/input|invalid|return_required|idempotency/.test(code))
    return t("invalid");
  if (code === "order_seller_inactive") return t("inactive");
  return t("error");
}
const money = (cents: number, currency: string, locale: string) =>
  new Intl.NumberFormat(locale, { style: "currency", currency }).format(
    cents / 100,
  );
const cents = (v: FormDataEntryValue | null) =>
  Math.round(Number(v || 0) * 100);
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-sm text-white/70">
      <span>{label}</span>
      {children}
    </label>
  );
}
function State({ value, t }: { value: string; t: T }) {
  return (
    <span
      className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${value === "delivered" ? "bg-emerald-400/10 text-emerald-200" : value.includes("cancelled") ? "bg-white/5 text-white/50" : "bg-violet-400/10 text-violet-200"}`}
    >
      {t(WORK_WORDS.has(value) ? value : "error")}
    </span>
  );
}
const box = `${CARD} p-4 sm:p-5`;
function OrderRow({ order, t }: { order: CustomerOrder; t: T }) {
  const due = order.deliveries
    .filter((d) => d.status === "confirmed")
    .reduce((s, d) => s + d.totalCents - d.paidCents, 0);
  const requested = order.lines.reduce((s, l) => s + l.quantity, 0),
    delivered = order.lines.reduce((s, l) => s + l.delivered, 0);
  return (
    <Link
      href={`/tags/orders/${order.id}`}
      className="flex min-h-20 items-center gap-4 border-b border-white/[0.07] py-4 last:border-0 hover:text-violet-200"
    >
      <div className="min-w-0 flex-1">
        <div className="truncate font-semibold">{order.customerName}</div>
        <div className="mt-1 truncate text-sm text-white/45">
          {order.lines.map((l) => l.description).join(" · ")}
        </div>
        <div className="mt-2">
          <State value={order.workState} t={t} />
          {due > 0 && (
            <p className="mt-2 text-xs text-amber-200">
              {t("due", { amount: money(due, order.currency, t.locale) })}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div className="font-semibold tabular-nums">
          {delivered} / {requested}
        </div>
        <div className="text-xs text-white/45">{t("delivered")}</div>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-white/30" />
    </Link>
  );
}

export function OrdersPanel({
  leadId,
  visitId,
  all = false,
}: {
  leadId?: number;
  visitId?: number;
  all?: boolean;
}) {
  const t = useOrdersT();
  const enabled = useXpotModules().includes("tags");
  const url = `${BASE}?work=attention&limit=3&all=${all}${leadId ? `&leadId=${leadId}` : ""}`;
  const query = useQuery<OrderPage>({
    queryKey: [url],
    staleTime: 15_000,
    enabled,
  });
  if (!enabled) return null;
  if (query.error)
    return (
      <div className={box}>
        <Link href="/tags/orders">{t("title")} →</Link>
      </div>
    );
  return (
    <section className={`${box} my-4`} aria-label={t("title")}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          className="inline-flex items-center gap-2 font-semibold"
          href={`/tags/orders?all=${all}&work=attention${leadId ? `&leadId=${leadId}` : ""}`}
        >
          <ClipboardList className="h-4 w-4 text-violet-300" />
          {t("title")}
          {query.data ? ` · ${query.data.total}` : ""}
        </Link>
        <Link
          className="text-sm text-violet-200"
          href={`/tags/orders/new${leadId ? `?leadId=${leadId}` : ""}`}
        >
          {t("newOrder")} +
        </Link>
      </div>
      {query.data?.items.map((order) => (
        <OrderRow key={order.id} order={order} t={t} />
      ))}
      {query.data?.total === 0 && (
        <p className="mt-3 text-sm text-white/45">{t("empty")}</p>
      )}
    </section>
  );
}

export default function CustomerOrders({ id }: { id?: string }) {
  const t = useOrdersT(),
    [, navigate] = useLocation();
  const [all, setAll] = useState(
      new URLSearchParams(window.location.search).get("all") === "true",
    ),
    [work, setWork] = useState(
      new URLSearchParams(window.location.search).get("work") === "attention"
        ? "attention"
        : "open",
    ),
    [offset, setOffset] = useState(0);
  const leadId =
    Number(new URLSearchParams(window.location.search).get("leadId")) ||
    undefined;
  const url = `${BASE}?all=${all}&work=${work}&limit=25&offset=${offset}${leadId ? `&leadId=${leadId}` : ""}`;
  const query = useQuery<OrderPage>({ queryKey: [url], enabled: !id });
  if (id === "new")
    return (
      <CreateOrder
        onCreated={(order) => navigate(`/tags/orders/${order.id}`)}
      />
    );
  if (id) return <OrderDetail key={id} id={id} />;
  return (
    <section className="pb-6" data-testid="customer-orders">
      <TopBar
        title={t("title")}
        sub={<p className="max-w-xl text-sm text-white/50">{t("intro")}</p>}
        right={
          <Button
            onClick={() =>
              navigate(`/tags/orders/new${leadId ? `?leadId=${leadId}` : ""}`)
            }
            variant="brand"
            accent="tags"
          >
            <Plus />
            {t("newOrder")}
          </Button>
        }
      />
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <select
          aria-label={t("team")}
          className={`${INPUT} w-auto`}
          value={String(all)}
          onChange={(e) => {
            setAll(e.target.value === "true");
            setOffset(0);
          }}
        >
          <option value="false">{t("mine")}</option>
          <option value="true">{t("team")}</option>
        </select>
        <select
          aria-label={t("attention")}
          className={`${INPUT} w-auto`}
          value={work}
          onChange={(e) => {
            setWork(e.target.value);
            setOffset(0);
          }}
        >
          {["open", "attention", "all"].map((v) => (
            <option value={v} key={v}>
              {t(v)}
            </option>
          ))}
        </select>
        {query.data && (
          <span className="ml-auto text-xs text-white/40">
            {t("count", { count: query.data.total })}
          </span>
        )}
      </div>
      {query.isLoading && <p role="status">{t("loading")}</p>}
      {query.error && (
        <p role="alert" className="text-rose-300">
          {errorText(query.error, t)}
        </p>
      )}
      <div className={box}>
        {query.data?.items.map((order) => (
          <OrderRow key={order.id} order={order} t={t} />
        ))}
        {query.data?.items.length === 0 && (
          <p className="py-8 text-center text-white/45">{t("empty")}</p>
        )}
      </div>
      <div className="mt-4 flex justify-between gap-3">
        {offset > 0 ? (
          <Button
            variant="secondary"
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            <ArrowLeft />
            {t("back")}
          </Button>
        ) : (
          <span />
        )}
        {query.data?.nextOffset != null && (
          <Button
            variant="secondary"
            onClick={() => setOffset(query.data!.nextOffset!)}
          >
            {t("more")}
            <ArrowRight />
          </Button>
        )}
      </div>
    </section>
  );
}

function CreateOrder({
  onCreated,
}: {
  onCreated: (order: CustomerOrder) => void;
}) {
  const tt = useT(tagsMessages as Dictionary<Record<string, string>>);
  const t = useOrdersT(),
    query = useQuery<OrderCatalog>({ queryKey: [`${BASE}/catalog`] });
  const leads = useQuery<
    Array<{ id: number; organizationId: number; name: string }>
  >({ queryKey: ["/api/xpot/leads"] });
  const params = new URLSearchParams(window.location.search),
    leadId = Number(params.get("leadId"));
  const [lead, setLead] = useState<LeadChoice>(
    leadId ? { leadId, name: params.get("name") || `#${leadId}` } : null,
  );
  const [items, setItems] = useState([
    { key: crypto.randomUUID(), modelId: "", custom: false },
  ]);
  const key = useRef({ body: "", key: "" });
  const mutation = useMutation({
    mutationFn: async (body: Fields) => {
      const text = JSON.stringify(body);
      if (key.current.body !== text)
        key.current = { body: text, key: crypto.randomUUID() };
      return api<CustomerOrder>(BASE, body, key.current.key);
    },
    onSuccess: onCreated,
  });
  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!lead?.leadId || !query.data) return;
    const fd = new FormData(e.currentTarget);
    const lines = items.map((item, i) => {
      const model = query.data.models.find((m) => m.id === item.modelId);
      return {
        description: String(fd.get(`description-${i}`) || model?.title || ""),
        quantity: Number(fd.get(`quantity-${i}`)),
        unitPriceCents: cents(fd.get(`price-${i}`)),
        custom: item.custom,
        ...(fd.get(`producer-${i}`)
          ? { producerOrganizationId: Number(fd.get(`producer-${i}`)) }
          : {}),
        ...(item.custom
          ? {
              salesProductId: Number(fd.get(`product-${i}`)),
              productType: String(fd.get(`shape-${i}`)),
              face: String(fd.get(`face-${i}`)),
            }
          : {
              modelId: model?.id,
              salesProductId: model?.salesProductId,
              productType: model?.productType,
              face: model?.face,
              theme: model?.theme,
            }),
      };
    });
    const product = query.data.products.find(
      (p) => p.id === lines[0].salesProductId,
    );
    mutation.mutate({
      leadId: lead.leadId,
      currency: product?.currency ?? "USD",
      notes: String(fd.get("notes") || ""),
      ...(Number(params.get("visitId"))
        ? { visitId: Number(params.get("visitId")) }
        : {}),
      ...(Number(params.get("opportunityId"))
        ? { opportunityId: Number(params.get("opportunityId")) }
        : {}),
      lines,
    });
  }
  return (
    <section className="mx-auto max-w-3xl pb-6">
      <TopBar title={t("newOrder")} back="/tags/orders" />
      <form onSubmit={submit} className={box}>
        <fieldset disabled={mutation.isPending} className="space-y-5">
          <p className="text-sm text-white/50">{t("createHint")}</p>
          <Field label={t("customer")}>
            <LeadPicker
              value={
                lead?.leadId
                  ? {
                      ...lead,
                      name:
                        leads.data?.find((l) => l.id === lead.leadId)?.name ??
                        lead.name,
                    }
                  : lead
              }
              onChange={setLead}
            />
          </Field>
          {!lead?.leadId && (
            <p className="text-xs text-amber-200">{t("existingCustomer")}</p>
          )}
          {items.map((item, i) => {
            const model = query.data?.models.find((m) => m.id === item.modelId);
            return (
              <div
                key={item.key}
                className="space-y-4 rounded-xl border border-white/10 p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <label className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={item.custom}
                      onChange={(e) =>
                        setItems(
                          items.map((v, j) =>
                            j === i ? { ...v, custom: e.target.checked } : v,
                          ),
                        )
                      }
                    />
                    {t(item.custom ? "custom" : "standard")}
                  </label>
                  {items.length > 1 && (
                    <Button
                      variant="ghost"
                      type="button"
                      onClick={() => setItems(items.filter((_, j) => j !== i))}
                    >
                      {t("remove")}
                    </Button>
                  )}
                </div>
                {item.custom ? (
                  <>
                    <Field label={t("product")}>
                      <select required name={`product-${i}`} className={INPUT}>
                        <option value="">{t("choose")}</option>
                        {query.data?.products.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.currency})
                          </option>
                        ))}
                      </select>
                    </Field>
                    <div className="grid grid-cols-2 gap-3">
                      <Field label={t("shape")}>
                        <select
                          name={`shape-${i}`}
                          className={INPUT}
                          defaultValue="large_plate"
                        >
                          {TAG_PRODUCT_TYPES.map((v) => (
                            <option key={v} value={v}>
                              {tt(`product_${v}`)}
                            </option>
                          ))}
                        </select>
                      </Field>
                      <Field label={t("face")}>
                        <select
                          name={`face-${i}`}
                          className={INPUT}
                          defaultValue="custom"
                        >
                          {TAG_FACES.map((v) => (
                            <option key={v} value={v}>
                              {tt(`face_${v}`)}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>
                    <Field label={t("description")}>
                      <input
                        required
                        maxLength={200}
                        name={`description-${i}`}
                        className={INPUT}
                      />
                    </Field>
                    <p className="text-xs text-white/50">{t("customHint")}</p>
                  </>
                ) : (
                  <Field label={t("model")}>
                    <select
                      required
                      value={item.modelId}
                      onChange={(e) =>
                        setItems(
                          items.map((v, j) =>
                            j === i ? { ...v, modelId: e.target.value } : v,
                          ),
                        )
                      }
                      className={INPUT}
                    >
                      <option value="">{t("choose")}</option>
                      {query.data?.models.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.title} ({m.currency})
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
                <Field label={t("producer")}>
                  <select
                    name={`producer-${i}`}
                    defaultValue=""
                    className={INPUT}
                  >
                    <option value="">{t("defaultProducer")}</option>
                    {query.data?.producers
                      .filter((p) =>
                        p.sellerOrganizationIds.includes(
                          leads.data?.find((l) => l.id === lead?.leadId)
                            ?.organizationId ?? 0,
                        ),
                      )
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label={t("quantity")}>
                    <input
                      required
                      type="number"
                      min={1}
                      max={1000}
                      name={`quantity-${i}`}
                      defaultValue={1}
                      className={INPUT}
                    />
                  </Field>
                  <Field label={t("price")}>
                    <input
                      key={model?.id ?? "custom"}
                      required
                      type="number"
                      min={0}
                      step="0.01"
                      max={1000000}
                      name={`price-${i}`}
                      defaultValue={
                        model ? model.unitPriceCents / 100 : undefined
                      }
                      className={INPUT}
                    />
                  </Field>
                </div>
              </div>
            );
          })}
          <Button
            variant="secondary"
            type="button"
            disabled={items.length >= 20}
            onClick={() =>
              setItems([
                ...items,
                { key: crypto.randomUUID(), modelId: "", custom: false },
              ])
            }
          >
            {t("addLine")}
          </Button>
          <Field label={t("notes")}>
            <textarea name="notes" maxLength={2000} className={INPUT} />
          </Field>
          {(mutation.error || query.error) && (
            <p role="alert" className="text-rose-300">
              {errorText(mutation.error ?? query.error, t)}
            </p>
          )}
          <Button
            variant="brand"
            accent="tags"
            type="submit"
            disabled={!lead?.leadId || !query.data}
          >
            {t(mutation.isPending ? "saving" : "save")}
          </Button>
        </fieldset>
      </form>
    </section>
  );
}

type Action = { kind: string; line?: OrderLine; deliveryId?: string };
function OrderDetail({ id }: { id: string }) {
  const t = useOrdersT(),
    cache = useQueryClient();
  const visitsEnabled = useXpotModules().includes("visits");
  const query = useQuery<CustomerOrder>({
    queryKey: [`${BASE}/${id}`],
    refetchInterval: 30_000,
  });
  const [action, setAction] = useState<Action | null>(null),
    [selected, setSelected] = useState<string[]>([]);
  const keys = useRef<OrderCommandAttempt | null>(null),
    expectedRevision = useRef<number | null>(null);
  const mutation = useMutation({
    mutationFn: async ({ name, body }: { name: string; body: Fields }) => {
      keys.current = retainOrderCommand(
        keys.current,
        {
          orderId: id,
          action: name,
          body,
          revision: expectedRevision.current ?? query.data!.revision,
        },
        () => crypto.randomUUID(),
      );
      const payload = { revision: keys.current.revision, ...body };
      return api<CustomerOrder>(
        `${BASE}/${id}/${name}`,
        payload,
        keys.current.key,
      );
    },
    onSuccess: (order) => {
      cache.setQueryData([`${BASE}/${id}`], order);
      setAction(null);
      setSelected([]);
      keys.current = null;
      void cache.invalidateQueries({
        predicate: (q) =>
          String(q.queryKey[0]).startsWith(BASE) &&
          q.queryKey[0] !== `${BASE}/${id}`,
      });
    },
    onError: async (error) => {
      const latest = await query.refetch();
      if (
        error instanceof RequestError &&
        error.code === "order_revision_conflict"
      ) {
        keys.current = null;
        expectedRevision.current = latest.data?.revision ?? null;
      }
    },
  });
  if (query.isLoading) return <p role="status">{t("loading")}</p>;
  if (!query.data) return <p role="alert">{errorText(query.error, t)}</p>;
  const order = query.data,
    active = order.status === "open",
    needsDelivery = order.lines.some((l) => l.remaining > 0);
  const run = (name: string, body: Fields) => mutation.mutate({ name, body });
  const toggle = (id: string) =>
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((v) => v !== id) : [...prev, id],
    );
  const choose = (next: Action) => {
    if (
      action?.kind === next.kind &&
      action.line?.id === next.line?.id &&
      action.deliveryId === next.deliveryId
    )
      return;
    mutation.reset();
    keys.current = null;
    expectedRevision.current = order.revision;
    setAction(next);
  };
  const totalSelected = order.lines.reduce(
    (sum, l) =>
      sum +
      l.units.filter(
        (u) => selected.includes(u.tagId) && u.state === "allocated",
      ).length *
        (l.unitPriceCents ?? 0),
    0,
  );
  return (
    <section className="pb-8" data-testid="customer-order-detail">
      <TopBar
        title={order.customerName}
        back="/tags/orders"
        sub={
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <State value={order.workState} t={t} />
            <span className="text-sm text-white/45">
              {order.sellerName} ·{" "}
              {new Date(order.createdAt).toLocaleDateString(t.locale)}
            </span>
          </div>
        }
      />
      {mutation.error && (
        <p
          role="alert"
          className="mb-4 rounded-xl border border-rose-400/20 bg-rose-400/5 p-4 text-sm text-rose-200"
        >
          {errorText(mutation.error, t)}
        </p>
      )}
      {!order.sellerActive && (
        <p role="status" className="mb-4 text-amber-200">
          {t("inactive")}
        </p>
      )}
      <fieldset disabled={mutation.isPending} className="min-w-0 space-y-5">
        {order.sellerView && (
          <div className="grid grid-cols-2 gap-3">
            <div className={box}>
              <p className="text-xs text-white/45">{t("total")}</p>
              <p className="mt-1 text-2xl font-semibold">
                {money(order.totalCents ?? 0, order.currency, t.locale)}
              </p>
            </div>
            <div className={box}>
              <p className="text-xs text-white/45">{t("credit")}</p>
              <p className="mt-1 text-2xl font-semibold text-emerald-200">
                {money(order.creditCents ?? 0, order.currency, t.locale)}
              </p>
            </div>
          </div>
        )}
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]">
          <div className="space-y-5">
            {order.lines.map((line) => (
              <article className={box} key={line.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-3">
                      <TagPieceVisual
                        productType={line.productType}
                        face={line.face}
                        modelSlug={line.modelSlug}
                        size="md"
                      />
                      <h2 className="text-lg font-semibold">
                        {line.description}
                      </h2>
                    </div>
                    <p className="mt-1 text-xs text-white/40">
                      {line.face}
                      {line.theme ? ` · ${line.theme}` : ""}
                      {line.unitPriceCents !== undefined
                        ? ` · ${money(line.unitPriceCents, order.currency, t.locale)}`
                        : ""}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums">
                    {line.delivered} / {line.quantity}
                  </span>
                </div>
                <div className="my-5 grid grid-cols-2 sm:grid-cols-4 gap-3 border-y border-white/[0.07] py-4">
                  {[
                    ["ready", line.ready],
                    ["pending", line.pending],
                    ["missing", line.toProduce],
                    ["remaining", line.remaining],
                  ].map(([label, value]) => (
                    <div key={String(label)}>
                      <p className="text-xl font-semibold tabular-nums">
                        {value}
                      </p>
                      <p className="text-xs text-white/45">
                        {t(String(label))}
                      </p>
                    </div>
                  ))}
                </div>
                {line.units
                  .filter((u) => u.state === "allocated")
                  .map((u) => (
                    <label
                      key={u.id}
                      className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-white/5"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(u.tagId)}
                        onChange={() => toggle(u.tagId)}
                      />
                      <span className="font-mono text-sm">{u.publicCode}</span>
                      <span className="ml-auto text-xs text-white/40">
                        {u.repId ? order.sellerName : t("production")}
                      </span>
                    </label>
                  ))}
                {active && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {order.sellerView && line.toProduce > 0 && (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setSelected([]);
                          choose({ kind: "allocate", line });
                        }}
                      >
                        {t("allocate")}
                      </Button>
                    )}
                    {line.toProduce > 0 &&
                      (order.sellerView || order.canProduce) && (
                        <Button
                          disabled={
                            !order.sellerActive ||
                            (line.custom === "custom" &&
                              (!line.approved || !line.modelId))
                          }
                          variant="brand"
                          accent="tags"
                          onClick={() => choose({ kind: "produce", line })}
                        >
                          {t("produce")}
                        </Button>
                      )}
                    {order.sellerView && (
                      <Button
                        variant="ghost"
                        onClick={() => choose({ kind: "change", line })}
                      >
                        {t("edit")}
                      </Button>
                    )}
                  </div>
                )}
                {line.cancelledQuantity > 0 && (
                  <p className="mt-3 text-xs text-white/45">
                    {t("cancelledUnits", { count: line.cancelledQuantity })}
                  </p>
                )}
                {line.production.length > 0 && (
                  <div className="mt-4 space-y-1 text-xs text-white/45">
                    {line.production.map((p) => (
                      <p key={p.id}>
                        {p.quantity} · {p.modelTitle} ·{" "}
                        {t(
                          p.status === "open"
                            ? "production"
                            : p.status === "printed"
                              ? "printed"
                              : "stopped",
                        )}
                      </p>
                    ))}
                    {order.canProduce && (
                      <Link
                        href="/admin/tags/production/orders"
                        className="inline-flex min-h-10 items-center text-violet-200"
                      >
                        {t("productionQueue")} →
                      </Link>
                    )}
                  </div>
                )}
                {line.custom === "custom" && (
                  <div className="mt-5 border-t border-white/10 pt-4">
                    <h3 className="font-semibold">{t("artworkTitle")}</h3>
                    <p className="mt-2 text-xs text-white/45">
                      {t("customHint")}
                    </p>
                    {line.artwork.map((a) => (
                      <div
                        key={a.id}
                        className="mt-3 rounded-xl bg-white/[0.03] p-3 text-sm"
                      >
                        <div className="flex flex-wrap justify-between gap-2">
                          <span>
                            #{a.revision} · {t(a.kind)}
                          </span>
                          <span className="text-xs text-violet-200">
                            {t(ART_WORDS.has(a.status) ? a.status : "error")}
                          </span>
                        </div>
                        <p className="mt-2 whitespace-pre-wrap text-white/65">
                          {a.description}
                        </p>
                        {a.hasFile && (
                          <a
                            className="mt-2 inline-flex min-h-10 items-center text-violet-200"
                            href={`${BASE}/${id}/artwork/${a.id}/file`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("viewFile")}
                          </a>
                        )}
                        {a.approvedBy && (
                          <p className="mt-2 text-xs text-white/45">
                            {a.approvedBy} · {a.approvalMethod}
                          </p>
                        )}
                        {order.sellerView &&
                          active &&
                          a.kind === "proof" &&
                          a.status === "proposed" &&
                          a === line.artwork.at(-1) && (
                            <Button
                              className="mt-2"
                              variant="secondary"
                              onClick={() =>
                                choose({ kind: `approve:${a.id}`, line })
                              }
                            >
                              {t("approve")}
                            </Button>
                          )}
                      </div>
                    ))}
                    {active &&
                      order.sellerView &&
                      !line.pending &&
                      !line.allocated &&
                      !line.delivered && (
                        <Button
                          className="mt-3"
                          variant="secondary"
                          onClick={() => choose({ kind: "artwork", line })}
                        >
                          {t("addArtwork")}
                        </Button>
                      )}
                    {active &&
                      order.canDesign &&
                      line.approved &&
                      !line.modelId && (
                        <Button
                          className="mt-3"
                          variant="secondary"
                          onClick={() => choose({ kind: "model", line })}
                        >
                          {t("linkModel")}
                        </Button>
                      )}
                  </div>
                )}
              </article>
            ))}
          </div>
          <aside className="space-y-5">
            {selected.length > 0 && (
              <div className={`${box} border-violet-400/25`}>
                <p className="font-semibold">
                  {t("selected", { count: selected.length })}
                </p>
                {order.sellerView && active && (
                  <>
                    <p className="my-2 text-xl">
                      {money(totalSelected, order.currency, t.locale)}
                    </p>
                    <Button
                      variant="brand"
                      accent="tags"
                      onClick={() => choose({ kind: "deliver" })}
                    >
                      {t("deliver")}
                    </Button>
                    <Button
                      className="mt-2"
                      variant="ghost"
                      onClick={() => choose({ kind: "release" })}
                    >
                      {t("release")}
                    </Button>
                  </>
                )}
                {order.canProduce && active && (
                  <Button
                    className="mt-3"
                    variant="secondary"
                    onClick={() =>
                      choose({
                        kind: "dispatch",
                        line: order.lines.find((l) =>
                          l.units.some((u) => selected.includes(u.tagId)),
                        ),
                      })
                    }
                  >
                    {t("dispatch")}
                  </Button>
                )}
              </div>
            )}
            {action && (
              <ActionForm
                key={`${action.kind}:${action.line?.id ?? ""}`}
                action={action}
                order={order}
                selected={selected}
                onSelect={toggle}
                onClose={() => setAction(null)}
                run={run}
                busy={mutation.isPending}
                t={t}
              />
            )}
            {order.sellerView && (
              <div className={box}>
                <h2 className="font-semibold">{t("payment")}</h2>
                <div className="mt-3 flex flex-wrap gap-2">
                  {active && needsDelivery && (
                    <Button
                      variant="secondary"
                      onClick={() => choose({ kind: "received" })}
                    >
                      {t("receive")}
                    </Button>
                  )}
                  {order.canManage && (order.creditCents ?? 0) > 0 && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => choose({ kind: "refund" })}
                      >
                        {t("refund")}
                      </Button>
                      <Button
                        variant="ghost"
                        onClick={() => choose({ kind: "retained" })}
                      >
                        {t("retained")}
                      </Button>
                    </>
                  )}
                </div>
                {order.payments
                  .filter((p) => p.kind !== "applied")
                  .map((p) => (
                    <div
                      key={p.id}
                      className="mt-3 border-t border-white/5 pt-3 text-sm"
                    >
                      <div className="flex justify-between gap-2">
                        <span>
                          {t(
                            p.kind === "refund"
                              ? "refunded"
                              : p.kind === "retained"
                                ? "retainedEntry"
                                : p.kind === "release"
                                  ? "creditRestored"
                                  : p.kind,
                          )}
                        </span>
                        <span>
                          {money(p.amountCents, order.currency, t.locale)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-white/40">
                        {p.reason === "delivery" ||
                        p.reason === "delivery_payment"
                          ? t(
                              p.reason === "delivery"
                                ? "delivered"
                                : "delivery_payment",
                            )
                          : p.reason}
                      </p>
                    </div>
                  ))}
              </div>
            )}
            {order.deliveries.length > 0 && (
              <div className={box}>
                <h2 className="font-semibold">{t("deliveries")}</h2>
                {order.deliveries.map((d) => (
                  <div
                    key={d.id}
                    className="mt-4 border-t border-white/10 pt-3"
                  >
                    {visitsEnabled ? (
                      <Link
                        className="text-sm text-violet-200"
                        href={`/sales/sales/${d.saleId}`}
                      >
                        #{d.saleId} ·{" "}
                        {money(d.totalCents, order.currency, t.locale)}
                      </Link>
                    ) : (
                      <p className="text-sm text-violet-200">
                        #{d.saleId} ·{" "}
                        {money(d.totalCents, order.currency, t.locale)}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-white/45">
                      {money(d.paidCents, order.currency, t.locale)} ·{" "}
                      {t(
                        d.status === "reversed"
                          ? "delivery_reversed"
                          : d.paymentStatus,
                      )}
                    </p>
                    {d.status === "confirmed" && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {d.paidCents < d.totalCents && (
                          <Button
                            variant="secondary"
                            onClick={() =>
                              choose({ kind: "settle", deliveryId: d.id })
                            }
                          >
                            {t("settle")}
                          </Button>
                        )}
                        {order.canManage && (
                          <Button
                            variant="ghost"
                            onClick={() =>
                              choose({ kind: "reverse", deliveryId: d.id })
                            }
                          >
                            {t("reverse")}
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {order.notes && (
              <div className={box}>
                <h2 className="font-semibold">{t("notes")}</h2>
                <p className="mt-2 whitespace-pre-wrap text-sm text-white/55">
                  {order.notes}
                </p>
              </div>
            )}
            {order.sellerView && (
              <div className={box}>
                <h2 className="font-semibold">{t("history")}</h2>
                {order.events.map((event) => (
                  <div
                    className="mt-3 border-l border-violet-400/20 pl-3"
                    key={event.id}
                  >
                    <p className="text-sm">
                      {t(
                        HISTORY_WORDS.has(event.action)
                          ? event.action
                          : "error",
                      )}
                    </p>
                    <p className="mt-1 text-xs text-white/40">
                      {new Date(event.createdAt).toLocaleString(t.locale)}
                    </p>
                    {typeof event.detail.reason === "string" && (
                      <p className="mt-1 text-xs text-white/50">
                        {event.detail.reason}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {order.sellerView && active && (
              <div className="flex flex-wrap gap-2">
                {order.canManage && (
                  <Button
                    variant="secondary"
                    onClick={() => choose({ kind: "reassign" })}
                  >
                    {t("reassign")}
                  </Button>
                )}
                {needsDelivery && (
                  <Button
                    variant="ghost"
                    onClick={() => choose({ kind: "cancel" })}
                  >
                    {t("cancel")}
                  </Button>
                )}
              </div>
            )}
          </aside>
        </div>
      </fieldset>
    </section>
  );
}

function ActionForm({
  action,
  order,
  selected,
  onSelect,
  onClose,
  run,
  busy,
  t,
}: {
  action: Action;
  order: CustomerOrder;
  selected: string[];
  onSelect: (id: string) => void;
  onClose: () => void;
  run: (name: string, body: Fields) => void;
  busy: boolean;
  t: T;
}) {
  const { kind, line } = action;
  const nfc = useT(printNfcMessages);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => {
    formRef.current?.scrollIntoView({ block: "nearest" });
    (
      formRef.current?.querySelector(
        "input,select,textarea",
      ) as HTMLElement | null
    )?.focus({ preventScroll: true });
  }, []);
  const [search, setSearch] = useState(""),
    [payment, setPayment] = useState(""),
    [fileError, setFileError] = useState("");
  const designs = useQuery<Array<{ id: string; title: string; slug: string }>>({
    queryKey: [`${BASE}/${order.id}/models/${line?.id}`],
    enabled: kind === "model",
  });
  const candidates = useQuery<Array<{ id: string; publicCode: string }>>({
    queryKey: [
      `${BASE}/${order.id}/candidates/${line?.id}?search=${encodeURIComponent(search)}`,
    ],
    enabled: kind === "allocate",
  });
  const assignees = useQuery<Array<{ id: number; name: string }>>({
    queryKey: [`${BASE}/${order.id}/assignees`],
    enabled: kind === "reassign",
  });
  const title = kind.startsWith("approve:")
    ? "approve"
    : kind === "received"
      ? "receive"
      : kind === "model"
        ? "linkModel"
        : kind === "change"
          ? "edit"
          : kind === "artwork"
            ? "addArtwork"
            : kind;
  const reason = [
    "cancel",
    "release",
    "change",
    "reassign",
    "reverse",
    "received",
    "refund",
    "retained",
  ].includes(kind);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    let body: Fields = {};
    let command = kind;
    if (kind === "produce")
      body = {
        lineId: line!.id,
        quantity: Number(fd.get("quantity")),
        ...(fd.get("nfcMount") ? { nfcMount: String(fd.get("nfcMount")) } : {}),
      };
    if (kind === "allocate") body = { lineId: line!.id, tagIds: selected };
    if (kind === "dispatch")
      body = {
        lineId: line!.id,
        tagIds: selected,
        ...(fd.get("cost") !== ""
          ? { unitCostCents: cents(fd.get("cost")) }
          : {}),
      };
    if (kind === "deliver")
      body = {
        tagIds: selected,
        paymentStatus: payment,
        applyCreditCents: cents(fd.get("credit")),
        paidCents: cents(fd.get("cash")),
        paymentMethod: fd.get("method") || undefined,
      };
    if (kind === "settle")
      body = {
        deliveryId: action.deliveryId,
        cashCents: cents(fd.get("cash")),
        applyCreditCents: cents(fd.get("credit")),
        paymentMethod: fd.get("method") || undefined,
      };
    if (kind === "release")
      body = { tagIds: selected, reason: fd.get("reason") };
    if (kind === "change")
      body = {
        lineId: line!.id,
        quantity: Number(fd.get("quantity")),
        unitPriceCents: cents(fd.get("price")),
        reason: fd.get("reason"),
      };
    if (kind === "reassign") {
      command = "change";
      body = { repId: Number(fd.get("rep")), reason: fd.get("reason") };
    }
    if (kind === "cancel") body = { reason: fd.get("reason") };
    if (kind === "reverse")
      body = {
        deliveryId: action.deliveryId,
        returned: fd.get("returned") === "on",
        reason: fd.get("reason"),
      };
    if (["received", "refund", "retained"].includes(kind)) {
      command = "payments";
      body = {
        kind,
        amountCents: cents(fd.get("amount")),
        reason: fd.get("reason"),
        paymentMethod: fd.get("method") || undefined,
        referenceId: fd.get("receipt") || undefined,
      };
    }
    if (kind === "model")
      body = { lineId: line!.id, modelId: String(fd.get("modelId")).trim() };
    if (kind.startsWith("approve:")) {
      command = "approve";
      body = {
        artworkId: kind.split(":")[1],
        approvedBy: fd.get("approvedBy"),
        approvalMethod: fd.get("approvalMethod"),
      };
    }
    if (kind === "artwork") {
      body = {
        lineId: line!.id,
        kind: fd.get("artKind"),
        description: fd.get("description"),
      };
      const file = fd.get("file") as File;
      if (file?.size) {
        if (file.size > 5 * 1024 * 1024) {
          setFileError(t("attach"));
          return;
        }
        body.file = {
          filename: file.name,
          contentType: file.type,
          data: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
        };
      }
    }
    run(command, body);
  }
  return (
    <form
      ref={formRef}
      onSubmit={submit}
      className={`${box} space-y-4 border-violet-400/30`}
      aria-label={t(title)}
    >
      <h2 className="font-semibold">{t(title)}</h2>
      {kind === "produce" && (
        <>
          <p className="text-sm text-white/55">
            {line?.description} · {t("missing")}: {line?.toProduce}
          </p>
          <Field label={t("quantity")}>
            <input
              required
              name="quantity"
              type="number"
              min={1}
              max={Math.min(line!.toProduce, PRINT_MAX_PLATES)}
              defaultValue={Math.min(line!.toProduce, PRINT_MAX_PLATES)}
              className={INPUT}
            />
          </Field>
          {line?.custom !== "custom" && (
            <Field label={nfc("question")}>
              <select name="nfcMount" defaultValue={PRINT_DEFAULT_NFC_MOUNT} className={INPUT}>
                {PRINT_NFC_MOUNTS.map((mount) => (
                  <option key={mount} value={mount}>
                    {nfc(`name_${mount}` as "name_sticker_round_25")}
                  </option>
                ))}
              </select>
            </Field>
          )}
        </>
      )}
      {kind === "allocate" && (
        <>
          <Field label={t("search")}>
            <input
              className={INPUT}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <p className="text-xs text-white/45">{t("candidates")}</p>
          <div className="max-h-64 overflow-auto">
            {candidates.data?.map((p) => (
              <label key={p.id} className="flex min-h-11 items-center gap-3">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={() => onSelect(p.id)}
                />
                <span className="font-mono text-sm">{p.publicCode}</span>
              </label>
            ))}
            {candidates.data?.length === 0 && (
              <p className="text-sm text-white/50">{t("empty")}</p>
            )}
            {candidates.error && <p role="alert">{t("error")}</p>}
          </div>
        </>
      )}
      {kind === "dispatch" && (
        <Field label={t("cost")}>
          <input
            name="cost"
            className={INPUT}
            type="number"
            step="0.01"
            min={0}
          />
        </Field>
      )}
      {(kind === "deliver" || kind === "settle") && (
        <>
          {kind === "deliver" && (
            <Field label={t("payment")}>
              <select
                required
                className={INPUT}
                value={payment}
                onChange={(e) => setPayment(e.target.value)}
              >
                <option value="">{t("choose")}</option>
                {["paid", "partial", "unpaid"].map((v) => (
                  <option key={v} value={v}>
                    {t(v)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            label={`${t("applyCredit")} (${money(order.creditCents ?? 0, order.currency, t.locale)})`}
          >
            <input
              name="credit"
              type="number"
              min={0}
              step="0.01"
              max={(order.creditCents ?? 0) / 100}
              defaultValue={0}
              className={INPUT}
            />
          </Field>
          {(kind === "settle" || payment === "partial") && (
            <Field label={t("cashNow")}>
              <input
                name="cash"
                type="number"
                min={0}
                step="0.01"
                defaultValue={0}
                className={INPUT}
              />
            </Field>
          )}
          <Method t={t} />
        </>
      )}
      {kind === "change" && (
        <>
          <Field label={t("quantity")}>
            <input
              required
              name="quantity"
              type="number"
              min={Math.max(1, line!.delivered)}
              max={1000}
              defaultValue={line!.quantity}
              className={INPUT}
            />
          </Field>
          <Field label={t("price")}>
            <input
              required
              name="price"
              type="number"
              min={0}
              step="0.01"
              defaultValue={(line!.unitPriceCents ?? 0) / 100}
              className={INPUT}
            />
          </Field>
        </>
      )}
      {kind === "reassign" && (
        <Field label={t("seller")}>
          <select required name="rep" defaultValue="" className={INPUT}>
            <option value="">{t("choose")}</option>
            {assignees.data?.map((r) => (
              <option value={r.id} key={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      {kind === "cancel" && (
        <p className="text-sm text-white/55">{t("cancelHint")}</p>
      )}
      {kind === "reverse" && (
        <>
          <p className="text-sm text-white/55">{t("reverseHint")}</p>
          <label className="flex items-start gap-2 text-sm">
            <input name="returned" type="checkbox" required />
            {t("returned")}
          </label>
        </>
      )}
      {["received", "refund", "retained"].includes(kind) && (
        <>
          <p className="text-xs text-white/50">{t("moneyHint")}</p>
          <Field label={t("amount")}>
            <input
              required
              name="amount"
              type="number"
              min={0.01}
              step="0.01"
              className={INPUT}
            />
          </Field>
          {kind === "received" ? (
            <Method t={t} />
          ) : (
            <Field label={t("receipt")}>
              <select required name="receipt" className={INPUT} defaultValue="">
                <option value="">{t("choose")}</option>
                {order.payments
                  .filter((p) => p.kind === "received")
                  .map((p) => (
                    <option value={p.id} key={p.id}>
                      {new Date(p.createdAt).toLocaleDateString(t.locale)} ·{" "}
                      {money(p.amountCents, order.currency, t.locale)}
                    </option>
                  ))}
              </select>
            </Field>
          )}
        </>
      )}
      {kind === "artwork" && (
        <>
          <Field label={t("artworkTitle")}>
            <select name="artKind" className={INPUT}>
              <option value="brief">{t("brief")}</option>
              {order.canDesign && <option value="proof">{t("proof")}</option>}
            </select>
          </Field>
          <Field label={t("description")}>
            <textarea
              required
              minLength={3}
              maxLength={1000}
              name="description"
              className={INPUT}
            />
          </Field>
          <Field label={t("attach")}>
            <input
              type="file"
              name="file"
              accept="image/png,image/jpeg,application/pdf"
              className="w-full text-xs"
            />
          </Field>
          {fileError && <p role="alert">{fileError}</p>}
        </>
      )}
      {kind.startsWith("approve:") && (
        <>
          <Field label={t("approvedBy")}>
            <input
              required
              name="approvedBy"
              maxLength={160}
              className={INPUT}
            />
          </Field>
          <Field label={t("approvalMethod")}>
            <input
              required
              name="approvalMethod"
              maxLength={160}
              className={INPUT}
            />
          </Field>
        </>
      )}
      {kind === "model" && (
        <Field label={t("model")}>
          <select required name="modelId" defaultValue="" className={INPUT}>
            <option value="">{t("choose")}</option>
            {designs.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>
        </Field>
      )}
      {reason && (
        <Field label={t("reason")}>
          <textarea
            required
            minLength={3}
            maxLength={1000}
            name="reason"
            className={INPUT}
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="brand"
          accent="tags"
          type="submit"
          disabled={busy || (kind === "allocate" && !selected.length)}
        >
          {t(
            busy
              ? "saving"
              : kind === "produce"
                ? "produce"
                : kind === "deliver"
                  ? "deliver"
                  : "save",
          )}
        </Button>
        <Button variant="ghost" type="button" onClick={onClose}>
          {t("close")}
        </Button>
      </div>
    </form>
  );
}
function Method({ t }: { t: T }) {
  return (
    <Field label={t("method")}>
      <select name="method" className={INPUT} defaultValue="">
        <option value="">{t("choose")}</option>
        {["cash", "card", "pix", "transfer", "invoice", "other"].map((v) => (
          <option value={v} key={v}>
            {t(v)}
          </option>
        ))}
      </select>
    </Field>
  );
}
