// An axis label that stays inside the chart. recharts centres each label under its bar, so the first one (and the last)
// is cut in half at the edge of a narrow chart ("ct 3" for "Oct 3", "3 de out." clipped in Portuguese): the first
// label starts at the edge and the last ends at it, the others stay centred.

type TickProps = {
  x?: number;
  y?: number;
  index?: number;
  visibleTicksCount?: number;
  payload?: { value: string };
};

export function EdgeTick({ format, x = 0, y = 0, index = 0, visibleTicksCount = 1, payload }: TickProps & { format: (value: string) => string }) {
  const anchor = index === 0 ? "start" : index === visibleTicksCount - 1 ? "end" : "middle";
  // The bar's own offset: the label starts at the chart's left edge, not under the bar's centre.
  const dx = anchor === "start" ? -6 : anchor === "end" ? 6 : 0;
  return (
    <text x={x + dx} y={y + 10} textAnchor={anchor} fill="rgba(255,255,255,0.35)" fontSize={10}>
      {payload ? format(payload.value) : null}
    </text>
  );
}
