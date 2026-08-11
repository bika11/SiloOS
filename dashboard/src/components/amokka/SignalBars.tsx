/**
 * SignalBars — three ascending bars showing link strength (Amokka DS).
 * Pure geometry. `level` 0–3 lights that many bars.
 */
interface SignalBarsProps {
  level?: number;
  height?: number;
}

export function SignalBars({ level = 0, height = 14 }: SignalBarsProps) {
  const bars = [0, 1, 2];
  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height }}
    >
      {bars.map((i) => (
        <span
          key={i}
          style={{
            width: 4,
            height: `${((i + 1) / bars.length) * 100}%`,
            background: i < level ? 'var(--text-primary)' : 'var(--border-color)',
          }}
        />
      ))}
    </span>
  );
}
