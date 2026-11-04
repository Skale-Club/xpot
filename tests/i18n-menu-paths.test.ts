// A message that sends the person to a menu ("Platform › Administration › Products") must name a menu that exists.
// Every step of such a path has to be a label the app itself shows, in the same language; when a screen is renamed or
// moved, the message that still points at the old name fails here instead of sending someone to a menu that is gone.

import { describe, expect, it } from "vitest";

type Dict = { en: Record<string, string>; pt: Record<string, string>; es: Record<string, string> };

const modules = import.meta.glob<Record<string, unknown>>("../client/src/i18n/messages/*.ts", { eager: true });

// Paths into somebody else's screens (the Twilio console, the NFC Tools app): not ours to check.
const EXTERNAL = new Set(["integrationTests.ts", "pieceCustody.ts"]);

const dictionaries = Object.entries(modules).flatMap(([path, mod]) =>
  Object.entries(mod)
    .filter(([name, value]) => name.endsWith("Messages") && value && typeof value === "object" && "en" in value)
    .map(([, value]) => ({ file: path.split("/").pop()!, dict: value as Dict })),
);

const SEPARATOR = " › ";

// Menus the app used to have. "Manage" is still a label in the dictionary (the module view's group), but no screen
// shows it any more, so a message that sends someone there is wrong even though the word exists. ("Admin" is back, as
// the name of the platform's panel; the old "Admin" menu it replaced no longer matters.)
const GONE = new Set(["Manage", "Gestão", "Gestión", "NFC writers", "Gravadores NFC", "Grabadores NFC", "Reps"]);

describe("menu paths in messages", () => {
  for (const lang of ["en", "pt", "es"] as const) {
    it(`${lang}: every step of a path is a label the app shows`, () => {
      const labels = new Set(dictionaries.flatMap(({ dict }) => Object.values(dict[lang])));
      const unknown: string[] = [];
      for (const { file, dict } of dictionaries) {
        if (EXTERNAL.has(file)) continue;
        for (const [key, text] of Object.entries(dict[lang])) {
          if (!text.includes(SEPARATOR)) continue;
          const path = /([^:.]+(?: › [^:.]+)+)/.exec(text)?.[1] ?? "";
          const steps = path.split(SEPARATOR);
          steps.forEach((step, index) => {
            // The first step may start inside a sentence ("Turn it on in Platform"), the last may run on into it
            // ("Products before selling"): match the end of the first and the start of the last.
            const words = step.trim().split(" ");
            const candidates = words.map((_, i) => (index === 0 && index !== steps.length - 1 ? words.slice(i) : words.slice(0, words.length - i)).join(" "));
            if (candidates.some((candidate) => GONE.has(candidate)) || !candidates.some((candidate) => labels.has(candidate))) unknown.push(`${file} ${key}: "${step.trim()}"`);
          });
        }
      }
      expect(unknown).toEqual([]);
    });
  }
});
