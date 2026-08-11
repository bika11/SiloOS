/**
 * Switch — 44×26 toggle (Amokka Design System). Border-driven; the knob
 * and track shift colour, no glow. Keyboard + pointer operable.
 */
interface SwitchProps {
  checked: boolean;
  onChange: (next: boolean) => void;
  'aria-label'?: string;
  disabled?: boolean;
}

export function Switch({ checked, onChange, disabled, ...aria }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={aria['aria-label']}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      style={{
        position: 'relative',
        width: 44,
        height: 26,
        padding: 0,
        flex: '0 0 auto',
        background: 'transparent',
        border: `1px solid ${checked ? 'var(--text-primary)' : 'var(--border-color)'}`,
        borderRadius: 'var(--radius)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color var(--dur-quick) var(--ease)',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          top: 3,
          left: checked ? 22 : 3,
          width: 18,
          height: 18,
          background: checked ? 'var(--text-primary)' : 'var(--text-secondary)',
          borderRadius: 1,
          transition: 'left var(--dur-quick) var(--ease), background var(--dur-quick) var(--ease)',
        }}
      />
    </button>
  );
}
