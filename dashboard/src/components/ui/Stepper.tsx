import React, { useState, useRef, useEffect, useCallback } from 'react';

interface StepperProps {
    label: string;
    unit: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (value: number) => void;
    decimalPlaces?: number;
}

export const Stepper: React.FC<StepperProps> = ({
    label,
    unit,
    value,
    min,
    max,
    step,
    onChange,
    decimalPlaces = 3
}) => {
    const [isPressing, setIsPressing] = useState<'plus' | 'minus' | null>(null);
    const valueRef = useRef(value);
    const timerRef = useRef<any>(null);
    const speedRef = useRef<number>(200);
    useEffect(() => { valueRef.current = value; }, [value]);

    const updateValue = useCallback((direction: 'plus' | 'minus') => {
        const currentVal = valueRef.current;
        let newValue = currentVal;
        if (direction === 'plus') {
            newValue = Math.min(max, currentVal + step);
        } else {
            newValue = Math.max(min, currentVal - step);
        }

        newValue = parseFloat(newValue.toFixed(decimalPlaces));

        if (newValue !== currentVal) {
            onChange(newValue);
        }
    }, [min, max, step, onChange, decimalPlaces]);

    const startRepeating = (direction: 'plus' | 'minus') => {
        updateValue(direction);
        setIsPressing(direction);

        let counter = 0;
        const run = () => {
            counter++;
            updateValue(direction);

            if (counter > 20) speedRef.current = 30;
            else if (counter > 10) speedRef.current = 60;
            else if (counter > 5) speedRef.current = 100;

            timerRef.current = setTimeout(run, speedRef.current);
        };

        timerRef.current = setTimeout(run, 400);
    };

    const stopRepeating = () => {
        setIsPressing(null);
        clearTimeout(timerRef.current);
        speedRef.current = 200;
    };

    useEffect(() => {
        return () => clearTimeout(timerRef.current);
    }, []);

    return (
        <div className="stepper-container flex flex-col gap-2 p-3 glass rounded-xl border border-zinc-800/50 w-full">
            <div className="flex justify-between items-baseline mb-1">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-zinc-500">{label}</span>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-mono text-amber font-bold leading-none tabular-nums">
                        {value.toFixed(decimalPlaces)}
                    </span>
                    <span className="text-xs font-mono text-zinc-400 font-medium uppercase tracking-wider">{unit}</span>
                </div>
            </div>

            <div className="flex gap-2 w-full">
                <button
                    className={`flex-1 btn btn-secondary h-16 text-2xl ${isPressing === 'minus' ? 'bg-zinc-800 border-amber' : ''}`}
                    onMouseDown={() => startRepeating('minus')}
                    onMouseUp={stopRepeating}
                    onMouseLeave={stopRepeating}
                    onTouchStart={(e) => { e.preventDefault(); startRepeating('minus'); }}
                    onTouchEnd={stopRepeating}
                    disabled={value <= min}
                >
                    -
                </button>
                <button
                    className={`flex-1 btn btn-secondary h-16 text-2xl ${isPressing === 'plus' ? 'bg-zinc-800 border-amber' : ''}`}
                    onMouseDown={() => startRepeating('plus')}
                    onMouseUp={stopRepeating}
                    onMouseLeave={stopRepeating}
                    onTouchStart={(e) => { e.preventDefault(); startRepeating('plus'); }}
                    onTouchEnd={stopRepeating}
                    disabled={value >= max}
                >
                    +
                </button>
            </div>
        </div>
    );
};
