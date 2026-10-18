import { cloneElement, forwardRef, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { SURFACE_MODAL } from "./surface";

// The one form field of the app. Every text box, select and textarea has the
// same height (44px), radius (rounded-xl = rounded-control), fill and border;
// focus shows the global brand-blue outline (index.css) plus a brighter
// border; errors turn the border red and show a line under the field. The font
// is 16px on phones so iOS doesn't zoom into the field, 14px from sm up.
//
//   <Field label={t("name")} hint={t("nameHint")} error={errors.name}>
//     <Input value={name} onChange={(e) => setName(e.target.value)} />
//   </Field>
//
// Field wires the label, hint and error to the control (htmlFor, aria-describedby,
// aria-invalid), so the control needs no id of its own.

/** Classes of a text control, for the rare custom one (a combobox input). */
export const FIELD_CONTROL =
  "w-full min-h-11 rounded-xl border border-white/10 bg-white/[0.05] px-3.5 text-base text-white placeholder:text-white/30 transition-colors hover:border-white/[0.16] focus:border-blue-400/60 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm aria-[invalid=true]:border-red-400/60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, type = "text", ...props }, ref) {
  return <input ref={ref} type={type} className={cn(FIELD_CONTROL, "py-2", className)} {...props} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(FIELD_CONTROL, "min-h-24 resize-y py-2.5 leading-relaxed", className)} {...props} />;
});

/** Native select (the phone's own picker) in the field style, with a chevron. */
export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement> & {
    options?: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
    /** First, empty option ("Pick one"). */
    placeholder?: string;
  }
>(function Select({ className, options, placeholder, children, ...props }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(FIELD_CONTROL, "appearance-none py-2 pr-9", className)} {...props}>
        {placeholder != null ? (
          <option value="" style={{ background: SURFACE_MODAL }}>
            {placeholder}
          </option>
        ) : null}
        {options?.map((option) => (
          <option key={option.value} value={option.value} disabled={option.disabled} style={{ background: SURFACE_MODAL }}>
            {option.label}
          </option>
        ))}
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" aria-hidden="true" />
    </div>
  );
});

/** Label + control + hint/error. Pass one Input, Select or Textarea (or any control taking id/aria props) as the child. */
export function Field({
  label,
  hint,
  error,
  required = false,
  children,
  className = "",
  id: idProp,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  /** Shown in red under the control; also marks the control aria-invalid. */
  error?: ReactNode;
  /** Adds a "*" after the label (the control's own `required` still validates). */
  required?: boolean;
  children: ReactNode;
  className?: string;
  /** Id for the control; generated when left out. */
  id?: string;
}) {
  const autoId = useId();
  const id = idProp ?? autoId;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  // The error replaces the hint on screen, so it replaces it for screen readers too.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: (children.props as { id?: string }).id ?? id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label ? (
        <label htmlFor={id} className="block text-xs font-semibold text-white/60">
          {label}
          {required ? <span className="ml-0.5 text-red-300" aria-hidden="true">*</span> : null}
        </label>
      ) : null}
      {control}
      {error ? (
        <p id={errorId} className="text-xs text-red-300">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-white/40">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
