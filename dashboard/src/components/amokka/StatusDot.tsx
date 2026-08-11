/**
 * StatusDot — 6px connection indicator (Amokka Design System).
 * Colour carries status: connected → green, error → red, idle → graphite.
 * Pure geometry, no icon library (DS rule).
 */

type DotState = 'connected' | 'error' | 'idle';

interface StatusDotProps {
  state?: DotState;
  size?: number;
}

const COLOR: Record<DotState, string> = {
  connected: 'var(--color-success)',
  error: 'var(--color-danger)',
  idle: 'var(--text-tertiary)',
};

export function StatusDot({ state = 'idle', size = 6 }: StatusDotProps) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: COLOR[state],
        flex: '0 0 auto',
      }}
    />
  );
}
