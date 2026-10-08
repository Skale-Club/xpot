import { useEffect, useRef, type ReactNode } from "react";

/**
 * Desktop list + detail. From `xl` the detail is a sticky column beside the
 * list; between `lg` and `xl` it opens as a centered pop-up over the list. With nothing
 * selected, `placeholder` fills the column (xl only). Escape closes the detail
 * unless a dialog is open on top of it or focus is in a form field.
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
  const asideRef = useRef<HTMLElement>(null);

  // Between lg and xl the detail is a pop-up over the list: stop the page
  // behind it from scrolling and send keyboard focus into it.
  useEffect(() => {
    if (!open || window.matchMedia("(min-width: 1280px)").matches) return;
    asideRef.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      // Escape while typing in the pane (an inline edit form) must not close it and drop the edits.
      const el = e.target as HTMLElement | null;
      if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
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
          <aside ref={asideRef} tabIndex={-1} className="fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[24px] border border-white/10 bg-[#080c18] p-4 shadow-2xl xl:sticky xl:left-auto xl:top-[88px] xl:z-auto xl:max-h-[calc(100vh-112px)] xl:w-auto xl:max-w-none xl:translate-x-0 xl:translate-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none outline-none">
            {detail}
          </aside>
        </>
      ) : placeholder ? (
        <aside className="sticky top-[88px] hidden xl:block">{placeholder}</aside>
      ) : null}
    </div>
  );
}
