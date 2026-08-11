/**
 * Sparkline — hairline telemetry chart (Amokka Design System).
 * A single normalised polyline over `points`. No axes, no fill — geometry only.
 */
interface SparklineProps {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({ points, width = 340, height = 44, color = 'var(--text-primary)' }: SparklineProps) {
  const pad = 2;
  const pts = points.length > 1 ? points : [0, 0];
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const stepX = pts.length > 1 ? (width - pad * 2) / (pts.length - 1) : 0;

  const d = pts
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (height - pad * 2) * (1 - (v - min) / span);
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth={1} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
