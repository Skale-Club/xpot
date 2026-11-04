// The rules of the piece pills (TagModelChips in TagProductThumbnail.tsx), apart from their drawing so they can be tested.

/** How much a pill writes. The look is one everywhere; each place picks the length that suits it. */
export type TagChipText = "short" | "long";

/** A model's short form: two letters ("ST", "PL"), because one would read as a size ("S" is Small). */
export function shortModelText(name: string): string {
  return name.slice(0, 2);
}

/** A size's short form: its first letter ("L", "S"). */
export function shortSizeText(name: string): string {
  return name.charAt(0);
}

/** A colour's look. A colour without its own look stays neutral and is told by its name. */
export function themeChipLook(theme: string): "black" | "white" | "mixed" | "neutral" {
  const key = theme.trim().toLowerCase();
  return key === "black" || key === "white" || key === "mixed" ? key : "neutral";
}
