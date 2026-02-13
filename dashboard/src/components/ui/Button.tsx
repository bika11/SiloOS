import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    variant = 'primary',
    size = 'md',
    isLoading = false,
    className = '',
    children,
    disabled,
    ...props
}) => {
    // Utilities for class composition manually (since no clx/tailwind)
    const baseClass = 'btn';
    const variantClass = `btn-${variant}`;

    // Size mapping (manual since no utility classes for padding yet, relying on CSS var tweaks or inline)
    // Actually, btn class has default padding. We can stick to that for now or add size classes.
    // Let's rely on base btn size for 'md', and add style overrides for others if needed.
    // For now, consistent size is better.

    // Combine classes
    const combinedClassName = `${baseClass} ${variantClass} ${className}`.trim();

    return (
        <button
            className={combinedClassName}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading ? (
                <span className="opacity-70">Loading...</span>
            ) : children}
        </button>
    );
};
