import { usePrintModels } from "@/pages/admin/tags/production-shared";
import { ListSkeleton } from "@/components/xpot/ListSkeleton";
import { useT } from "@/i18n";
import { partnerMaterialsMessages } from "@/i18n/messages/partnerMaterials";

// The models an organization may print (organizations.released_print_models), as a checklist of our catalog. `value`
// null is "every model" (nobody restricted it yet): every box shows ticked, and the first change makes the list
// explicit. The platform's owners only; the server refuses any other model (print_model_not_released).

export function ReleasedModelsField({ value, onChange, disabled = false }: {
  value: string[] | null;
  onChange: (slugs: string[]) => void;
  disabled?: boolean;
}) {
  const m = useT(partnerMaterialsMessages);
  const { data, isLoading, error } = usePrintModels();
  // Parts are never released: a partner prints serialized pieces only.
  const models = (data ?? []).filter((model) => model.kind === "serialized" && (model.status !== "retired" || value?.includes(model.slug)));
  const selected = new Set(value ?? models.map((model) => model.slug));
  const toggle = (slug: string, checked: boolean) => {
    const next = new Set(selected);
    if (checked) next.add(slug);
    else next.delete(slug);
    onChange(models.map((model) => model.slug).filter((s) => next.has(s)));
  };
  return (
    <fieldset className="space-y-2 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 py-3" disabled={disabled} data-testid="organization-released-models">
      <legend className="sr-only">{m("releasedTitle")}</legend>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-white/85" aria-hidden="true">{m("releasedTitle")}</p>
          <p className="mt-0.5 text-xs text-white/40">{value === null ? m("releasedUnrestricted") : value.length ? m.plural("releasedCount", value.length) : m("releasedNone")}</p>
        </div>
        {models.length && !disabled ? (
          <div className="flex gap-3 text-xs">
            <button type="button" className="text-violet-300 underline underline-offset-2 disabled:opacity-50" disabled={disabled} onClick={() => onChange(models.map((model) => model.slug))}>{m("releasedAll")}</button>
            <button type="button" className="text-white/60 underline underline-offset-2 disabled:opacity-50" disabled={disabled} onClick={() => onChange([])}>{m("releasedClear")}</button>
          </div>
        ) : null}
      </div>
      <p className="text-xs text-white/40">{m("releasedHint")}</p>
      {isLoading ? <ListSkeleton rows={3} rowClassName="h-11 rounded-lg" /> : error && !data ? <p role="alert" className="text-xs text-red-300">{m("releasedError")}</p> : !models.length ? <p className="text-xs text-white/50">{m("releasedEmpty")}</p> : (
        <ul className="max-h-64 divide-y divide-white/[0.05] overflow-y-auto">
          {models.map((model) => (
            <li key={model.slug}>
              <label className={`flex min-h-11 items-center gap-2.5 text-sm ${disabled ? "text-white/35" : "cursor-pointer text-white/75"}`}>
                <input
                  type="checkbox"
                  checked={selected.has(model.slug)}
                  disabled={disabled}
                  onChange={(event) => toggle(model.slug, event.target.checked)}
                  className="h-4 w-4 shrink-0 accent-violet-500"
                  data-testid={`released-model-${model.slug}`}
                />
                <span className="min-w-0 truncate">{model.title}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
