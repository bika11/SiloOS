import React from 'react';
import type { ParsedMenuItem } from '../../entities/Menu';
// import '../../features.css'; // Global features.css is imported in App.tsx

interface DrinkMenuProps {
    items: ParsedMenuItem[];
    onOrder: (item: ParsedMenuItem) => void;
    isLoading?: boolean;
}

export const DrinkMenuScreen: React.FC<DrinkMenuProps> = ({ items, onOrder, isLoading }) => {
    if (isLoading) {
        return (
            <div className="menu-loading">
                <div className="spinner"></div>
                <p>Loading Menu...</p>
            </div>
        );
    }

    if (items.length === 0) {
        return (
            <div className="menu-empty">
                <p>No drinks found.</p>
            </div>
        );
    }

    return (
        <div className="drink-grid">
            {(items || []).map((item) => {
                return (
                    <button
                        key={item.id}
                        className="drink-card"
                        onClick={() => onOrder(item)}
                    >
                        <span className="drink-name">{item.id}. {item.name}</span>
                    </button>
                );
            })}
        </div>
    );
};
