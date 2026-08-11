/**
 * InfoRow — a label→value pair on a hairline row (Amokka Design System).
 * Maps to the Flutter app's _InfoRow. Key is small-caps; value is body.
 */
import type { ReactNode } from 'react';

interface InfoRowProps {
  label: ReactNode;
  value: ReactNode;
  /** Show the bottom hairline. Off for the last row in a group. */
  divider?: boolean;
}

export function InfoRow({ label, value, divider = true }: InfoRowProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        justifyContent: 'space-between',
        gap: 16,
        padding: '13px 0',
        borderBottom: divider ? '1px solid var(--border-color)' : 'none',
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
        {label}
      </span>
      <span
        style={{
          fontSize: 'var(--body-size-sm)',
          color: 'var(--text-primary)',
          fontVariantNumeric: 'tabular-nums',
          textAlign: 'right',
        }}
      >
        {value}
      </span>
    </div>
  );
}
