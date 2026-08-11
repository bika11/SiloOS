/**
 * Button — Amokka Design System action (primary / ghost / danger).
 * Border-driven, never filled with colour; label + border shift on state.
 * Touch target ≥ min-height. No ripple, no scale-down (DS motion rules).
 */
import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'ghost' | 'danger';

interface AmokkaButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  children: ReactNode;
  /** Fill available width (default true — the console uses full-width actions). */
  block?: boolean;
}

export function Button({
  variant = 'primary',
  children,
  block = true,
  disabled,
  style,
  ...rest
}: AmokkaButtonProps) {
  const base = {
    minHeight: 'var(--button-min-height)',
    width: block ? '100%' : undefined,
    padding: '0 22px',
    background: 'transparent',
    borderRadius: 'var(--radius)',
    borderWidth: 1,
    borderStyle: 'solid',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'var(--font-brand)',
    fontSize: 'var(--label-size)',
    fontWeight: 500,
    letterSpacing: 'var(--label-tracking)',
    textTransform: 'uppercase' as const,
    transition: 'color var(--dur-quick) var(--ease), border-color var(--dur-quick) var(--ease)',
  };

  const byVariant: Record<Variant, object> = {
    primary: { borderColor: 'var(--text-primary)', color: 'var(--text-primary)' },
    ghost: { borderColor: 'var(--border-color)', color: 'var(--text-secondary)' },
    danger: { borderColor: 'var(--color-danger)', color: 'var(--danger-text)' },
  };

  const disabledStyle = disabled
    ? { borderColor: 'var(--border-color)', color: 'var(--text-tertiary)' }
    : {};

  return (
    <button
      type="button"
      disabled={disabled}
      style={{ ...base, ...byVariant[variant], ...disabledStyle, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
}
