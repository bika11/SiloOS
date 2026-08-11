/**
 * Label — the all-caps micro-type workhorse (Amokka Design System).
 * Small, medium weight, wide tracking. Used for section names & keys.
 */
import type { CSSProperties, ReactNode } from 'react';

interface LabelProps {
  children: ReactNode;
  /** Tertiary greys the label down for muted/inactive contexts. */
  tone?: 'secondary' | 'primary';
  style?: CSSProperties;
}

export function Label({ children, tone = 'secondary', style }: LabelProps) {
  return (
    <span
      style={{
        fontSize: 'var(--label-size)',
        fontWeight: 500,
        letterSpacing: 'var(--label-tracking)',
        textTransform: 'uppercase',
        color: tone === 'primary' ? 'var(--text-primary)' : 'var(--text-secondary)',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
