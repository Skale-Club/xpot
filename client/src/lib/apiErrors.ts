// Field errors a failed save carries, read from any of the shapes the server
// sends: the uniform list (server/lib/validation.ts), raw Zod issues
// (errorHandler.ts) and Zod's flatten() ({ fieldErrors, formErrors }). Screens
// show the first one, worded in the user's language, instead of "Invalid input".

import { translate } from "@/i18n";
import { apiErrorMessages } from "@/i18n/messages/apiErrors";

export interface FieldError {
  /** Dotted path into what was sent, e.g. "faq.items.2.answer"; "" when it is about the whole form. */
  path: string;
  message: string;
  code?: string;
  params?: Record<string, string | number>;
}

function asPath(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(".");
  return typeof value === "string" ? value : "";
}

/** The field errors in a parsed error body; empty when it has none. */
export function parseFieldErrors(body: unknown): FieldError[] {
  if (!body || typeof body !== "object") return [];
  const errors = (body as { errors?: unknown }).errors;
  if (Array.isArray(errors)) {
    return errors.flatMap((item): FieldError[] => {
      if (!item || typeof item !== "object") return [];
      const e = item as { path?: unknown; message?: unknown; code?: unknown; params?: unknown };
      if (typeof e.message !== "string") return [];
      return [{
        path: asPath(e.path),
        message: e.message,
        ...(typeof e.code === "string" ? { code: e.code } : {}),
        ...(e.params && typeof e.params === "object" ? { params: e.params as Record<string, string | number> } : {}),
      }];
    });
  }
  if (errors && typeof errors === "object") {
    const flat = errors as { fieldErrors?: Record<string, unknown>; formErrors?: unknown };
    const out: FieldError[] = [];
    for (const [path, messages] of Object.entries(flat.fieldErrors ?? {})) {
      if (Array.isArray(messages)) for (const message of messages) if (typeof message === "string") out.push({ path, message });
    }
    if (Array.isArray(flat.formErrors)) for (const message of flat.formErrors) if (typeof message === "string") out.push({ path: "", message });
    return out;
  }
  return [];
}

/** One field error in the user's language: its code's sentence, else the server's own. */
export function fieldErrorText(error: FieldError): string {
  const key = error.code ? (`err_${error.code}` as keyof typeof apiErrorMessages.en) : null;
  if (key && key in apiErrorMessages.en) return translate(apiErrorMessages, key, error.params);
  return error.message;
}

function fieldErrorsOf(err: unknown): FieldError[] {
  if (err && typeof err === "object" && Array.isArray((err as { fieldErrors?: unknown }).fieldErrors)) {
    return (err as { fieldErrors: FieldError[] }).fieldErrors;
  }
  return [];
}

/**
 * What a toast says about a failed save: the first field error, named with the
 * screen's own label for it, plus how many more there are; else the server's message.
 */
export function describeApiError(err: unknown, label?: (path: string) => string | null | undefined): string {
  const errors = fieldErrorsOf(err);
  if (!errors.length) return err instanceof Error ? err.message : String(err ?? "");
  const [first, ...rest] = errors;
  const text = fieldErrorText(first);
  const field = first.path ? label?.(first.path) ?? null : null;
  const head = field ? translate(apiErrorMessages, "fieldAndMessage", { field, message: text }) : text;
  if (!rest.length) return head;
  const more = translate(apiErrorMessages, rest.length === 1 ? "moreErrors_one" : "moreErrors_other", { count: rest.length });
  return `${head} ${more}`;
}
