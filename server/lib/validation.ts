// One shape for "this input is wrong" answers, so the screens can point at the
// field: { message, code: "invalid_input", errors: [{ path, message, code }] }.
// `message` stays a readable English sentence (the first problem) for callers
// that only show that; `code` on each error lets the client word it in the
// user's language (client/src/lib/apiErrors.ts).

import type { Response } from "express";
import type { ZodError, ZodIssue } from "zod";

export type FieldErrorCode = "required" | "too_long" | "invalid_url" | "invalid_color" | "invalid_format" | "invalid";

export interface FieldError {
  /** Dotted path into the body, e.g. "faq.items.2.answer"; "" for the body itself. */
  path: string;
  message: string;
  code: FieldErrorCode | string;
  /** Values the code's wording needs, e.g. { max: 160 }. */
  params?: Record<string, string | number>;
}

function issueCode(issue: ZodIssue): Pick<FieldError, "code" | "params"> {
  switch (issue.code) {
    case "too_small":
      return issue.type === "string" && Number(issue.minimum) <= 1 ? { code: "required" } : { code: "invalid", params: { min: Number(issue.minimum) } };
    case "too_big":
      return issue.type === "string" ? { code: "too_long", params: { max: Number(issue.maximum) } } : { code: "invalid", params: { max: Number(issue.maximum) } };
    case "invalid_string":
      if (issue.validation === "url") return { code: "invalid_url" };
      return { code: "invalid_format" };
    case "invalid_type":
      return issue.received === "undefined" || issue.received === "null" ? { code: "required" } : { code: "invalid" };
    default:
      return { code: "invalid" };
  }
}

/**
 * The issues of a failed parse as field errors. `codes` names a more specific
 * code for a path (e.g. { accountSid: "invalid_twilio_sid" }) where the generic
 * one would say too little.
 */
export function fieldErrors(error: ZodError, codes: Record<string, string> = {}): FieldError[] {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    const generic = issueCode(issue);
    return { path, message: issue.message, ...generic, ...(codes[path] ? { code: codes[path] } : {}) };
  });
}

/** Answers 400 with the field errors of a failed parse. */
export function sendValidationError(res: Response, error: ZodError, message: string, codes: Record<string, string> = {}) {
  return res.status(400).json({ message, code: "invalid_input", errors: fieldErrors(error, codes) });
}

/** The JSON body for a coded refusal (AccountError, OrganizationError…): { message, code? }. */
export function refusalBody(err: { message: string; code?: string }) {
  return { message: err.message, ...(err.code ? { code: err.code } : {}) };
}
