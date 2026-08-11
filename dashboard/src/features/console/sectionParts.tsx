/** Shared building blocks for console sections (Amokka Design System). */
import type { ReactNode } from 'react';
import { Label } from '../../components/amokka';

export function SectionHead({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="console-section-head">
      <Label>{title}</Label>
      {aside && (
        <span style={{ fontSize: 12, color: 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {aside}
        </span>
      )}
    </div>
  );
}

/** Placeholder body for sections not yet wired (clearly labelled, per plan). */
export function SectionPlaceholder({ note }: { note: string }) {
  return (
    <div
      style={{
        border: '1px solid var(--border-color)',
        borderTop: 'none',
        padding: '48px 28px',
        color: 'var(--text-secondary)',
        fontSize: 13,
      }}
    >
      {note}
    </div>
  );
}
