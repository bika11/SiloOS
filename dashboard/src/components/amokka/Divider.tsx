/** Divider — a single hairline separator (Amokka Design System). */
interface DividerProps {
  /** Vertical margin around the line, in px. */
  gap?: number;
}

export function Divider({ gap = 0 }: DividerProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        height: 1,
        background: 'var(--border-color)',
        margin: gap ? `${gap}px 0` : undefined,
      }}
    />
  );
}
