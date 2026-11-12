import type { ProgressMetric } from "@/lib/api/types";

const W = 320;
const H = 96;
const PAD = { left: 10, right: 14, top: 12, bottom: 12 };

/** One metric across scans: a 2px line, ringed dots, interval whiskers and the typical range. */
export function Trend({ metric }: { metric: ProgressMetric }) {
  const points = metric.points;
  const times = points.map((p) => new Date(p.at).getTime());
  const spread = Math.max(...times) - Math.min(...times);
  const xs = points.map((_, index) =>
    spread > 60_000
      ? PAD.left + ((times[index]! - Math.min(...times)) / spread) * (W - PAD.left - PAD.right)
      : PAD.left + (index / Math.max(1, points.length - 1)) * (W - PAD.left - PAD.right),
  );
  const values = points.flatMap((p) => [p.value, p.ci_low ?? p.value, p.ci_high ?? p.value]);
  if (metric.reference_low != null && metric.reference_high != null)
    values.push(metric.reference_low, metric.reference_high);
  let low = Math.min(...values);
  let high = Math.max(...values);
  const margin = (high - low || Math.abs(high) || 1) * 0.12;
  low -= margin;
  high += margin;
  const y = (v: number) => PAD.top + (1 - (v - low) / (high - low)) * (H - PAD.top - PAD.bottom);
  const path = points
    .map((p, index) => `${index ? "L" : "M"}${xs[index]!.toFixed(1)} ${y(p.value).toFixed(1)}`)
    .join("");
  const label = `${metric.title}: ${points.map((p) => p.display).join(", then ")}`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={label}>
      {metric.reference_low != null && metric.reference_high != null && (
        <rect
          x={0}
          width={W}
          y={y(metric.reference_high)}
          height={Math.max(1, y(metric.reference_low) - y(metric.reference_high))}
          fill="#284c6b"
          fillOpacity={0.35}
          rx={3}
        >
          <title>Typical range</title>
        </rect>
      )}
      <path
        d={path}
        stroke="#a8d3f2"
        strokeWidth={2}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {points.map((point, index) => (
        <g key={point.scan_id}>
          {point.ci_low != null && point.ci_high != null && (
            <line
              x1={xs[index]}
              x2={xs[index]}
              y1={y(point.ci_low)}
              y2={y(point.ci_high)}
              stroke="#a8d3f2"
              strokeOpacity={0.5}
              strokeWidth={2}
              strokeLinecap="round"
            />
          )}
          <circle cx={xs[index]} cy={y(point.value)} r={4.5} fill="#dbeefb" stroke="#05070a" strokeWidth={2}>
            <title>{`${point.display} on ${new Date(point.at).toLocaleDateString("en-US")}`}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}
