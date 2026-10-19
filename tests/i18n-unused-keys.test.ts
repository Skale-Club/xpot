// Every message key is named somewhere in the client. A key nothing reads is dead copy
// that still gets translated three times; `npx tsx scripts/i18n-unused-keys.ts` lists
// them, and the keys only reachable through a template, for a human to check. A lookup
// no template spells out goes in that script's DYNAMIC_PREFIXES allowlist.

import { describe, expect, it } from "vitest";
import { DYNAMIC_PREFIXES, dictionariesOf, findUnusedKeys, readClientSources } from "../scripts/i18n-unused-keys";

const modules = import.meta.glob<Record<string, unknown>>("../client/src/i18n/messages/*.ts", { eager: true });

describe("i18n keys", () => {
  const dictionaries = dictionariesOf(modules);

  it("are all named by the client", () => {
    const { unused } = findUnusedKeys(dictionaries, readClientSources(process.cwd()));
    expect(unused.map((ref) => `${ref.file} ${ref.key}`)).toEqual([]);
  });

  it("keep no stale allowlist entry", () => {
    const stale = Object.entries(DYNAMIC_PREFIXES).flatMap(([file, prefixes]) =>
      prefixes
        .filter((prefix) => !dictionaries.some((d) => d.file === file && d.keys.some((key) => key.startsWith(prefix))))
        .map((prefix) => `${file} ${prefix}`),
    );
    expect(stale).toEqual([]);
  });
});

describe("findUnusedKeys", () => {
  const dict = (keys: string[]) => [{ file: "x.ts", name: "xMessages", keys }];
  const unusedOf = (keys: string[], ...sources: string[]) => findUnusedKeys(dict(keys), sources, {}).unused.map((ref) => ref.key);

  it("counts a quoted key, in any quotes", () => {
    expect(unusedOf(["save", "cancel", "close", "gone"], `t("save")`, `const k = 'cancel'`, "t(`close`)")).toEqual(["gone"]);
  });

  it("counts a plural pair through its base", () => {
    expect(unusedOf(["pieces_one", "pieces_other", "old_one", "old_other"], `t.plural("pieces", n)`)).toEqual(["old_one", "old_other"]);
  });

  it("counts keys a template can build, and reports them for review", () => {
    const sources = ["t(`status_${s}`)", "t(`${kind}Label`)", `t("srv_" + code)`];
    const result = findUnusedKeys(dict(["status_live", "nameLabel", "srv_kit_closed", "other"]), sources, {});
    expect(result.unused.map((ref) => ref.key)).toEqual(["other"]);
    expect(result.viaTemplate.map((ref) => ref.key)).toEqual(["status_live", "nameLabel", "srv_kit_closed"]);
  });

  it("does not take a React key or a unit for a key template", () => {
    expect(unusedOf(["cancel", "items"], "<li key={`c${id}`} />", "`${total}s`")).toEqual(["cancel", "items"]);
  });

  it("counts a key read straight off a table", () => {
    expect(unusedOf(["heroSub", "gone"], "const m = landingMessages[lang];\nreturn m.heroSub;")).toEqual(["gone"]);
  });

  it("lets an allowlisted prefix through, as a key to review", () => {
    const result = findUnusedKeys(dict(["hero_badge", "gone"]), [], { "x.ts": ["hero_"] });
    expect(result.unused.map((ref) => ref.key)).toEqual(["gone"]);
    expect(result.viaTemplate.map((ref) => ref.key)).toEqual(["hero_badge"]);
  });
});
