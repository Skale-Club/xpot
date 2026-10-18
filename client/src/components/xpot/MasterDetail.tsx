import { useEffect, useRef, type ReactNode } from "react";
import { OVERLAY_CLASS, SURFACE_MODAL_CLASS } from "./surface";

/** From xl, without `popup`: the pop-up turns back into a sticky column beside the list. */
const SIDE_COLUMN =
  "xl:sticky xl:left-auto xl:top-[88px] xl:z-auto xl:max-h-[calc(100vh-112px)] xl:w-auto xl:max-w-none xl:translate-x-0 xl:translate-y-0 xl:rounded-none xl:border-0 xl:bg-transparent xl:p-0 xl:shadow-none";

/**
 * Desktop list + detail. From `xl` the detail is a sticky column beside the
 * list; between `lg` and `xl` it opens as a centered pop-up over the list. With nothing
 * selected, `placeholder` fills the column (xl only). Escape closes the detail
 * unless a dialog is open on top of it or focus is in a form field. With
 * `popup` the detail is always the centered pop-up, at every width.
 */
export function MasterDetail({
  list,
  detail,
  placeholder,
  onClose,
  closeLabel,
  popup = false,
}: {
  list: ReactNode;
  /** null when nothing is selected. */
  detail: ReactNode | null;
  placeholder?: ReactNode;
  onClose: () => void;
  closeLabel: string;
  popup?: boolean;
}) {
  const open = detail != null;
  const asideRef = useRef<HTMLElement>(null);

  // Between lg and xl the detail is a pop-up over the list: stop the page
  // behind it from scrolling and send keyboard focus into it.
  useEffect(() => {
    if (!open || (!popup && window.matchMedia("(min-width: 1280px)").matches)) return;
    asideRef.current?.focus({ preventScroll: true });
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open, popup]);

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
    <div className={popup ? "" : "grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_420px]"}>
      <div className="min-w-0 space-y-2">{list}</div>
      {open ? (
        <>
          <button type="button" aria-label={closeLabel} onClick={onClose} className={`fixed inset-0 z-40 ${OVERLAY_CLASS} ${popup ? "" : "xl:hidden"}`} />
          <aside
            ref={asideRef}
            tabIndex={-1}
            className={`fixed left-1/2 top-1/2 z-50 max-h-[88vh] w-[560px] max-w-[92vw] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-3xl ${SURFACE_MODAL_CLASS} p-4 shadow-2xl outline-none ${popup ? "" : SIDE_COLUMN}`}
          >
            {detail}
          </aside>
        </>
      ) : placeholder && !popup ? (
        <aside className="sticky top-[88px] hidden xl:block">{placeholder}</aside>
      ) : null}
    </div>
  );
}
