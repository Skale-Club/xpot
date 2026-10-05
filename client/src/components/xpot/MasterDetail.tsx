import { useEffect, type ReactNode } from "react";

/**
 * Desktop list + detail. From `xl` the detail is a sticky column beside the
 * list; between `lg` and `xl` it slides over as a drawer. With nothing
 * selected, `placeholder` fills the column (xl only). Escape closes the detail
 * unless a dialog is open on top of it.
 */
export function MasterDetail({
  list,
  detail,
  placeholder,
  onClose,
  closeLabel,
}: {
  list: ReactNode;
  /** null when nothing is selected. */
  detail: ReactNode | null;
  placeholder?: ReactNode;
  onClose: () => void;
  closeLabel: string;
}) {
  const open = detail != null;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
      <div className="min-w-0 space-y-2">{list}</div>
      {open ? (
        <>
          <button type="button" aria-label={closeLabel} onClick={onClose} className="fixed inset-0 z-40 bg-black/50 xl:hidden" />
          <aside className="fixed inset-y-0 right-0 z-50 w-[440px] max-w-[90vw] overflow-y-auto border-l border-white/10 bg-[#080c18] p-4 shadow-2xl xl:sticky xl:top-[88px] xl:z-auto xl:max-h-[calc(100vh-112px)] xl:w-auto xl:max-w-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none">
            {detail}
          </aside>
        </>
      ) : placeholder ? (
        <aside className="sticky top-[88px] hidden xl:block">{placeholder}</aside>
      ) : null}
    </div>
  );
}
