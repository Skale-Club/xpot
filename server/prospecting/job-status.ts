export function earliestStartedAt(values: Array<Date | null>): Date | null {
  let earliest: Date | null = null;
  for (const value of values) {
    if (value && (!earliest || value.getTime() < earliest.getTime())) earliest = value;
  }
  return earliest;
}
