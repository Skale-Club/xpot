// Every refused save answers with the fields at fault and a stable code per field,
// so the screens can name the field in the user's language (server/lib/validation.ts).

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { fieldErrors } from "../server/lib/validation";

const schema = z.object({
  title: z.string().trim().min(1).max(10),
  url: z.string().url(),
  color: z.string().regex(/^#[0-9a-f]{6}$/),
  items: z.array(z.object({ answer: z.string().min(1) })),
});

describe("fieldErrors", () => {
  it("gives a dotted path and a code for each problem", () => {
    const result = schema.safeParse({ title: "", url: "nope", color: "red", items: [{ answer: "ok" }, { answer: "" }] });
    expect(result.success).toBe(false);
    const errors = fieldErrors((result as { error: z.ZodError }).error, { color: "invalid_color" });
    expect(errors.map(({ path, code }) => ({ path, code }))).toEqual([
      { path: "title", code: "required" },
      { path: "url", code: "invalid_url" },
      { path: "color", code: "invalid_color" },
      { path: "items.1.answer", code: "required" },
    ]);
  });

  it("carries the limit of a text that is too long", () => {
    const result = schema.shape.title.safeParse("x".repeat(11));
    const [error] = fieldErrors((result as { error: z.ZodError }).error);
    expect(error).toMatchObject({ path: "", code: "too_long", params: { max: 10 } });
  });

  it("calls a missing field required", () => {
    const result = z.object({ name: z.string() }).safeParse({});
    expect(fieldErrors((result as { error: z.ZodError }).error)[0]).toMatchObject({ path: "name", code: "required" });
  });
});
