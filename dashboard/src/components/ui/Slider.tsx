import React from 'react';
import './Slider.css';

interface SliderProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
    step?: number;
    label?: string;
    unit?: string;
    disabled?: boolean;
    className?: string;
}

export const Slider: React.FC<SliderProps> = ({
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    unit = '',
    disabled = false,
    className = ''
}) => {
    return (
        <div className={`industrial-slider-container ${className}`}>
            {(label || unit) && (
                <div className="industrial-sliderLabel">
                    <span>{label}</span>
                    <span className="industrial-sliderValue">
                        {value.toFixed(step < 1 ? 1 : 0)}{unit}
                    </span>
                </div>
            )}
            <input
                type="range"
                className="industrial-slider"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(parseFloat(e.target.value))}
                disabled={disabled}
            />
        </div>
    );
};
