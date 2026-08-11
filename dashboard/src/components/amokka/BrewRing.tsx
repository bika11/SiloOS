/**
 * BrewRing — the one component with personality (Amokka Design System).
 * A thin ring that fills with dose progress; centre shows the status word.
 * It fills even under prefers-reduced-motion — it is information, not decoration.
 */
interface BrewRingProps {
  /** 0..1 */
  progress: number;
  state?: 'brewing' | 'done' | 'error';
  statusText?: string;
  size?: number;
}

const STROKE = 2;

const ARC_COLOR: Record<NonNullable<BrewRingProps['state']>, string> = {
  brewing: 'var(--text-primary)',
  done: 'var(--color-success)',
  error: 'var(--color-danger)',
};

export function BrewRing({ progress, state = 'brewing', statusText, size = 240 }: BrewRingProps) {
  const r = (size - STROKE) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = c * (1 - clamped);
  const center = size / 2;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={statusText}>
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke="var(--border-color)"
          strokeWidth={STROKE}
        />
        <circle
          cx={center}
          cy={center}
          r={r}
          fill="none"
          stroke={ARC_COLOR[state]}
          strokeWidth={STROKE}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="butt"
          transform={`rotate(-90 ${center} ${center})`}
          style={{ transition: 'stroke-dashoffset var(--dur-fade) linear' }}
        />
      </svg>
      {statusText && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 'var(--label-size)',
              fontWeight: 500,
              letterSpacing: 'var(--label-tracking)',
              textTransform: 'uppercase',
              color: 'var(--text-secondary)',
            }}
          >
            {statusText}
          </span>
          <span style={{ fontSize: 28, fontWeight: 200, fontVariantNumeric: 'tabular-nums' }}>
            {Math.round(clamped * 100)}%
          </span>
        </div>
      )}
    </div>
  );
}
