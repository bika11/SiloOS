/**
 * Stepper — Amokka Design System numeric control: hairline −/+ squares around
 * an ultralight value. Presentational only. Glove-friendly 44px targets.
 */
interface StepperProps {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (next: number) => void;
  unit?: string;
  decimalPlaces?: number;
  /** Font size of the value, px. */
  size?: number;
  'aria-label'?: string;
}

const btn = {
  width: 44,
  height: 44,
  background: 'transparent',
  border: '1px solid var(--border-color)',
  borderRadius: 'var(--radius)',
  cursor: 'pointer',
  color: 'var(--text-primary)',
  fontFamily: 'var(--font-brand)',
  fontSize: 18,
} as const;

export function Stepper({
  value,
  min,
  max,
  step,
  onChange,
  unit,
  decimalPlaces = 1,
  size = 44,
  ...aria
}: StepperProps) {
  const clamp = (n: number) => Math.min(max, Math.max(min, parseFloat(n.toFixed(decimalPlaces))));
  const dec = () => onChange(clamp(value - step));
  const inc = () => onChange(clamp(value + step));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
      <button type="button" aria-label="Decrease" onClick={dec} disabled={value <= min} style={{ ...btn, color: value <= min ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
        &#8722;
      </button>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, minWidth: 130, justifyContent: 'center' }}>
        <input
          type="text"
          inputMode="decimal"
          aria-label={aria['aria-label']}
          value={value.toFixed(decimalPlaces)}
          onChange={(e) => {
            const n = parseFloat(e.target.value.replace(/[^0-9.]/g, ''));
            if (!isNaN(n)) onChange(clamp(n));
          }}
          style={{
            width: 110,
            padding: '2px 0',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid transparent',
            borderRadius: 0,
            textAlign: 'right',
            fontFamily: 'var(--font-brand)',
            fontSize: size,
            fontWeight: 200,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        {unit && <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{unit}</span>}
      </div>
      <button type="button" aria-label="Increase" onClick={inc} disabled={value >= max} style={{ ...btn, color: value >= max ? 'var(--text-tertiary)' : 'var(--text-primary)' }}>
        +
      </button>
    </div>
  );
}
