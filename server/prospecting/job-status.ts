export function earliestStartedAt(values: Array<Date | null>): Date | null {
  let earliest: Date | null = null;
  for (const value of values) {
    if (value && (!earliest || value.getTime() < earliest.getTime())) earliest = value;
  }
  return earliest;
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
