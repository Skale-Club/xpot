// Finds message keys (client/src/i18n/messages/*.ts) that no client code names.
//
//   npx tsx scripts/i18n-unused-keys.ts
//
// A key counts as used when client/src (outside the message files) holds it as a
// quoted string: t("save"), labelKey: "save", ["a", "b"].map(t). A plural pair
// (x_one, x_other) is used when x is (t.plural("x", n)). Keys built at run time
// cannot be seen, so any key that fits a template in the code (t(`status_${s}`),
// `${kind}Label`, "srv_" + code) counts as used too, and the report lists those
// separately for a human to check. A lookup no template spells out goes in
// DYNAMIC_PREFIXES. tests/i18n-unused-keys.test.ts fails on an unused key.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { pathToFileURL } from "node:url";

export type MessageDictionary = { file: string; name: string; keys: string[] };
export type KeyRef = { file: string; name: string; key: string };
export type TemplateRef = KeyRef & { template: string };

/** A run-time key: what it starts and ends with (`status_${x}` → "status_", ""). */
type Template = { prefix: string; suffix: string; source: string };

/**
 * Keys looked up in a way no template in the code spells out, by messages file and
 * key prefix. Each entry says where the lookup is.
 */
export const DYNAMIC_PREFIXES: Record<string, readonly string[]> = {
  // pages/admin/landingFields.ts labels a landing field by its path: t(`${group}_${key}`).
  "landingAdmin.ts": ["navigation_", "account_", "hero_", "mockup_", "footer_"],
};

const MESSAGES_DIR = "client/src/i18n/messages";
const SOURCE_EXT = /\.(ts|tsx)$/;
const KEYLIKE = /^[A-Za-z_][\w.-]*$/;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : SOURCE_EXT.test(entry) ? [path] : [];
  });
}

/** Every client source file except the dictionaries themselves. */
export function readClientSources(root: string): string[] {
  const messages = join(root, MESSAGES_DIR);
  // i18n/index.tsx is the lookup itself (`${key}_one`), not a caller.
  const lookup = join(root, "client/src/i18n/index.tsx");
  return walk(join(root, "client/src"))
    .filter((path) => !path.startsWith(messages) && path !== lookup)
    .map((path) => readFileSync(path, "utf8"));
}

/** Quoted key-like strings, and the fixed ends of keys built at run time. */
export function scanSources(sources: readonly string[]) {
  const literals = new Set<string>();
  const templates: Template[] = [];
  for (const text of sources) {
    // A file that reads a table straight (landingMessages[lang].heroSub, m.heroSub) names
    // its keys as properties, not strings.
    if (/\w+Messages\[/.test(text)) {
      for (const m of Array.from(text.matchAll(/\.([A-Za-z_]\w*)\b/g))) literals.add(m[1]);
    }
    for (const m of Array.from(text.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'/g))) {
      const value = m[1] ?? m[2];
      if (!KEYLIKE.test(value)) continue;
      literals.add(value);
      // "srv_" + code
      if (/[_.]$/.test(value)) templates.push({ prefix: value, suffix: "", source: m[0] });
    }
    for (const m of Array.from(text.matchAll(/`([^`]*)`/g))) {
      const body = m[1];
      if (!body.includes("${")) {
        if (KEYLIKE.test(body)) literals.add(body);
        continue;
      }
      // Only templates that look like a key: `status_${s}`, `${kind}Label`, `tab_${id}_hint`.
      const parts = body.split(/\$\{(?:[^{}]|\{[^{}]*\})*\}/);
      if (parts.length < 2 || !parts.every((part) => part === "" || /^[\w.-]+$/.test(part))) continue;
      const prefix = parts[0];
      const suffix = parts[parts.length - 1];
      // `c${id}`, `${n}s`: a React key or a unit, not a message key.
      if (prefix.length >= 3 || suffix.length >= 3) templates.push({ prefix, suffix, source: m[0] });
    }
  }
  return { literals, templates };
}

/** Which keys no code names, and which are only reached through a template. */
export function findUnusedKeys(
  dictionaries: readonly MessageDictionary[],
  sources: readonly string[],
  dynamicPrefixes: Record<string, readonly string[]> = DYNAMIC_PREFIXES,
) {
  const { literals, templates } = scanSources(sources);
  const unused: KeyRef[] = [];
  const viaTemplate: TemplateRef[] = [];
  for (const { file, name, keys } of dictionaries) {
    for (const key of keys) {
      const base = key.replace(/_(one|other)$/, "");
      if (literals.has(key) || (base !== key && literals.has(base))) continue;
      const template = templates.find((tpl) => key.startsWith(tpl.prefix) && key.endsWith(tpl.suffix) && key.length >= tpl.prefix.length + tpl.suffix.length);
      const prefix = (dynamicPrefixes[file] ?? []).find((p) => key.startsWith(p));
      if (template) viaTemplate.push({ file, name, key, template: template.source });
      else if (prefix) viaTemplate.push({ file, name, key, template: `DYNAMIC_PREFIXES "${prefix}"` });
      else unused.push({ file, name, key });
    }
  }
  return { unused, viaTemplate };
}

/** The `*Messages` dictionaries of every messages file, by their English keys. */
export function dictionariesOf(modules: Record<string, Record<string, unknown>>): MessageDictionary[] {
  return Object.entries(modules).flatMap(([path, mod]) =>
    Object.entries(mod)
      .filter(([name, value]) => name.endsWith("Messages") && value && typeof value === "object" && "en" in value)
      .map(([name, value]) => ({
        file: path.split("/").pop()!,
        name,
        keys: Object.keys((value as { en: Record<string, string> }).en),
      })),
  );
}

async function main() {
  const root = process.cwd();
  const dir = join(root, MESSAGES_DIR);
  const modules: Record<string, Record<string, unknown>> = {};
  for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
    modules[relative(root, join(dir, file))] = await import(pathToFileURL(join(dir, file)).href);
  }
  const { unused, viaTemplate } = findUnusedKeys(dictionariesOf(modules), readClientSources(root));
  console.log(`Unused (${unused.length}):`);
  for (const ref of unused) console.log(`  ${ref.file} ${ref.name}.${ref.key}`);
  console.log(`\nOnly through a template, check by hand (${viaTemplate.length}):`);
  for (const ref of viaTemplate) console.log(`  ${ref.file} ${ref.name}.${ref.key}  ← ${ref.template}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) void main();
