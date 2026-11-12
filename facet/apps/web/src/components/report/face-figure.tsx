import { EDGES, LANDMARKS } from "@/lib/face/canonical";

export type Overlay = "proportions" | "symmetry" | "mesh";

interface Props {
  /** 468+ points with y pointing down, in any unit. */
  points: [number, number][];
  overlay: Overlay;
  pairs?: [number, number, string, number][];
  thirds?: { middle: number; lower: number };
  photoUrl?: string | null;
  /** Size of the photo in the same units as the points, when one is shown. */
  photoSize?: { width: number; height: number };
  className?: string;
}

const SIZE = 1000;
const HEAT_MAX = 0.06; // 6% of the inter-pupillary distance and above reads as the brightest step

function mix(t: number): string {
  // powder-800 to powder-50: one hue, brighter means more (the dark-surface direction).
  const a = [40, 76, 107];
  const b = [238, 247, 253];
  const c = a.map((v, i) => Math.round(v + (b[i]! - v) * t));
  return `rgb(${c[0]} ${c[1]} ${c[2]})`;
}

/** The face mesh as a wireframe (optionally over the user's photo) with one overlay. */
export function FaceFigure({ points, overlay, pairs, thirds, photoUrl, photoSize, className }: Props) {
  const mesh = points.slice(0, 468);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [x, y] of mesh) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const padX = (maxX - minX) * 0.36;
  const padY = (maxY - minY) * 0.14;
  const boxW = maxX - minX + padX * 2;
  const boxH = maxY - minY + padY * 2;
  const k = SIZE / boxW;
  const height = boxH * k;
  const px = (x: number) => (x - minX + padX) * k;
  const py = (y: number) => (y - minY + padY) * k;
  const p = mesh.map(([x, y]) => [px(x), py(y)] as const);
  const at = (name: keyof typeof LANDMARKS) => p[LANDMARKS[name]]!;

  const wire = EDGES.map(
    ([a, b]) =>
      `M${p[a]![0].toFixed(1)} ${p[a]![1].toFixed(1)}L${p[b]![0].toFixed(1)} ${p[b]![1].toFixed(1)}`,
  ).join("");
  const faceLeft = at("zygion_r")[0];
  const faceRight = at("zygion_l")[0];
  const unit =
    Math.hypot(
      at("exocanthion_l")[0] - at("exocanthion_r")[0],
      at("exocanthion_l")[1] - at("exocanthion_r")[1],
    ) / 1.45;

  return (
    <svg
      viewBox={`0 0 ${SIZE} ${height.toFixed(0)}`}
      className={className}
      role="img"
      aria-label={`Face mesh with the ${overlay} overlay`}
    >
      {photoUrl && photoSize && (
        <image
          href={photoUrl}
          x={px(0)}
          y={py(0)}
          width={photoSize.width * k}
          height={photoSize.height * k}
          preserveAspectRatio="none"
          opacity={0.9}
        />
      )}
      {photoUrl && <rect width={SIZE} height={height} fill="#000" opacity={0.28} />}
      <path
        d={wire}
        stroke="#a8d3f2"
        strokeOpacity={photoUrl ? 0.22 : overlay === "mesh" ? 0.42 : 0.2}
        strokeWidth={1}
        fill="none"
      />

      {overlay === "mesh" &&
        p.map(([x, y], index) => (
          <circle key={index} cx={x} cy={y} r={1.6} fill="#c3e2f7" fillOpacity={0.8} />
        ))}

      {overlay === "proportions" && (
        <g>
          {(["glabella", "subnasale", "menton"] as const).map((name) => (
            <line
              key={name}
              x1={faceLeft - 30}
              x2={faceRight + 30}
              y1={at(name)[1]}
              y2={at(name)[1]}
              stroke="#dbeefb"
              strokeWidth={1.5}
            />
          ))}
          {(
            [
              "zygion_r",
              "exocanthion_r",
              "endocanthion_r",
              "endocanthion_l",
              "exocanthion_l",
              "zygion_l",
            ] as const
          ).map((name) => (
            <line
              key={name}
              x1={at(name)[0]}
              x2={at(name)[0]}
              y1={at("glabella")[1] - 70}
              y2={at("subnasale")[1] - 40}
              stroke="#86bfe8"
              strokeOpacity={0.75}
              strokeWidth={1.25}
            />
          ))}
          {thirds && (
            <g fontSize={24} fill="#eef4f9" fontFamily="var(--font-mono)">
              <Bracket
                x={faceRight + 46}
                y1={at("glabella")[1]}
                y2={at("subnasale")[1]}
                name="Middle"
                value={`${(thirds.middle * 100).toFixed(1)}%`}
              />
              <Bracket
                x={faceRight + 46}
                y1={at("subnasale")[1]}
                y2={at("menton")[1]}
                name="Lower"
                value={`${(thirds.lower * 100).toFixed(1)}%`}
              />
            </g>
          )}
          {(
            [
              "glabella",
              "subnasale",
              "menton",
              "endocanthion_r",
              "endocanthion_l",
              "exocanthion_r",
              "exocanthion_l",
            ] as const
          ).map((name) => (
            <circle
              key={name}
              cx={at(name)[0]}
              cy={at(name)[1]}
              r={5}
              fill="#eef7fd"
              stroke="#000"
              strokeWidth={2}
            />
          ))}
        </g>
      )}

      {overlay === "symmetry" && pairs && (
        <g>
          <line
            x1={(at("glabella")[0] + at("menton")[0]) / 2 + (at("glabella")[0] - at("menton")[0]) * 0.75}
            y1={at("glabella")[1] - (at("menton")[1] - at("glabella")[1]) * 0.25}
            x2={(at("glabella")[0] + at("menton")[0]) / 2 - (at("glabella")[0] - at("menton")[0]) * 0.6}
            y2={at("menton")[1] + (at("menton")[1] - at("glabella")[1]) * 0.1}
            stroke="#dbeefb"
            strokeOpacity={0.55}
            strokeWidth={1.25}
          />
          {[...pairs]
            .sort((a, b) => a[3] - b[3])
            .flatMap(([right, left, , deviation]) => {
              const t = Math.min(1, deviation / HEAT_MAX);
              const r = (0.018 + 0.05 * t) * unit;
              return [right, left].map((index) => (
                <circle
                  key={`${right}-${index}`}
                  cx={p[index]![0]}
                  cy={p[index]![1]}
                  r={r}
                  fill={mix(t)}
                  fillOpacity={0.35 + 0.6 * t}
                  stroke="#000"
                  strokeWidth={1}
                />
              ));
            })}
        </g>
      )}
    </svg>
  );
}

function Bracket({
  x,
  y1,
  y2,
  name,
  value,
}: {
  x: number;
  y1: number;
  y2: number;
  name: string;
  value: string;
}) {
  const middle = (y1 + y2) / 2;
  return (
    <g>
      <path
        d={`M${x - 10} ${y1 + 4}H${x}V${y2 - 4}H${x - 10}`}
        stroke="#86bfe8"
        strokeWidth={1.5}
        fill="none"
      />
      <text x={x + 14} y={middle - 4} fill="#a9b8c6" fontSize={19}>
        {name}
      </text>
      <text x={x + 14} y={middle + 24}>
        {value}
      </text>
    </g>
  );
}

export function HeatLegend() {
  return (
    <div className="flex items-center gap-3 text-[11px] text-fg-3 num">
      <span>0%</span>
      <span
        className="h-1.5 w-28 rounded-full"
        style={{ background: "linear-gradient(90deg, #284c6b, #64a4d6, #eef7fd)" }}
      />
      <span>6%+ of pupil distance</span>
    </div>
  );
}
