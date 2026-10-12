export const MAX_AUTOMATIC_WAVES = 2;

const normalizedArea = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function chooseExpansionArea(input: {
  anchor: string;
  searchedAreas: string[];
  candidateCities: Array<string | null>;
  nextWave: number;
}): { location: string; reason: string } | null {
  if (input.nextWave > MAX_AUTOMATIC_WAVES) return null;
  const searched = new Set(input.searchedAreas.map(normalizedArea));
  const anchor = normalizedArea(input.anchor);
  const counts = new Map<string, { label: string; count: number }>();
  for (const rawCity of input.candidateCities) {
    const city = rawCity?.trim();
    if (!city) continue;
    const key = normalizedArea(city);
    if (key === anchor || searched.has(key)) continue;
    const current = counts.get(key);
    counts.set(key, { label: city, count: (current?.count ?? 0) + 1 });
  }
  const frontier = Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))[0];
  if (frontier) return { location: frontier.label, reason: "candidate_frontier" };

  const nearby = `${input.anchor} and nearby areas`;
  if (!searched.has(normalizedArea(nearby))) return { location: nearby, reason: "broaden_anchor" };
  return null;
}
