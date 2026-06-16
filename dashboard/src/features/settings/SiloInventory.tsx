import React, { useState, useEffect } from 'react';
import { SiloManager } from '../../bluetooth/SiloManager';
import { cropsterClient, type CropsterLot } from '../../services/cropster';
import { logger } from '../../utils/logger';

interface SiloInventoryProps {
    siloManager: SiloManager;
    activeSilos: string[]; // List of known silo IDs (e.g. ['A', 'B'])
}

export interface SiloInventoryState {
    lotId: string;
    lotName: string;
    lotType: string;
    initialFillKg: number;
    currentCalculatedKg: number;
    lastAssignedAt: number;
}

export const SiloInventory: React.FC<SiloInventoryProps> = ({ siloManager, activeSilos }) => {
    const [lots, setLots] = useState<CropsterLot[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [inventory, setInventory] = useState<Record<string, SiloInventoryState>>(
        siloManager.getPreferences().inventory || {}
    );

    // UI input state for new assignments
    const [editSilo, setEditSilo] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedLotId, setSelectedLotId] = useState('');
    const [fillWeightKg, setFillWeightKg] = useState('5.0');
    // UI input state for top ups
    const [topUpSiloId, setTopUpSiloId] = useState<string | null>(null);
    const [topUpWeightKg, setTopUpWeightKg] = useState<string>('1.0');

    useEffect(() => {
        const onPreferences = (newPrefs: any) => {
            if (newPrefs.inventory) setInventory(newPrefs.inventory);
        };
        const interval = setInterval(() => {
            const prefs = siloManager.getPreferences();
            if (prefs.inventory) {
                setInventory(prefs.inventory);
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [siloManager]);

    const fetchLots = async (force = false) => {
        setLoading(true);
        setError(null);
        try {
            const fetched = await cropsterClient.fetchSiloCandidateLots(force);
            setLots(fetched);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch lots from Cropster');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchLots();
    }, []);

    const handleAssign = (siloId: string) => {
        const lot = lots.find(l => l.id === selectedLotId);
        if (!lot) return;

        const initialFill = parseFloat(fillWeightKg);
        if (isNaN(initialFill) || initialFill <= 0) {
            alert("Please enter a valid fill weight in kg");
            return;
        }

        const newState: SiloInventoryState = {
            lotId: lot.id,
            lotName: lot.name,
            lotType: lot.type,
            initialFillKg: initialFill,
            currentCalculatedKg: initialFill, // reset
            lastAssignedAt: Date.now()
        };

        const currentInv = { ...(siloManager.getPreferences().inventory || {}) };
        currentInv[siloId] = newState;

        siloManager.updatePreferences({ ...siloManager.getPreferences(), inventory: currentInv });
        setInventory(currentInv);
        setEditSilo(null);
        logger.info('Inventory', `Assigned Lot ${lot.name} to Silo ${siloId} (${initialFill}kg)`);
    };

    const handleTopUp = (siloId: string) => {
        const added = parseFloat(topUpWeightKg);
        if (isNaN(added) || added <= 0) {
            alert("Please enter a valid top up weight in kg");
            return;
        }
        siloManager.topUpSilo(siloId, added);
        setTopUpSiloId(null);
        setTopUpWeightKg('1.0');
    };

    const handleClear = (siloId: string) => {
        if (!confirm(`Are you sure you want to clear the inventory for Silo ${siloId}?`)) return;

        const currentInv = { ...inventory };
        delete currentInv[siloId];
        siloManager.updatePreferences({ ...siloManager.getPreferences(), inventory: currentInv });
        setInventory(currentInv);
    };

    const filteredLots = lots.filter(l =>
        l.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.id.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="silo-inventory-section mt-6">
            <div className="flex justify-between items-center mb-4">
                <h3 className="text-xs font-mono text-zinc-500 uppercase tracking-widest">
                    Green Bean Inventory
                </h3>
                <button
                    className="btn btn-secondary py-1 px-3 text-[10px]"
                    onClick={() => fetchLots(true)}
                    disabled={loading}
                >
                    {loading ? 'SYNCING...' : '↻ SYNC CROPSTER'}
                </button>
            </div>
            {error && <div className="text-red-400 mb-2 text-sm">{error}</div>}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {activeSilos.length === 0 ? (
                    <div className="col-span-full py-6 text-center bg-zinc-900/30 rounded border border-dashed border-zinc-800 text-zinc-600 font-mono text-xs">
                        No active silos detected.
                    </div>
                ) : (
                    activeSilos.map(siloId => {
                        const inv = inventory[siloId];

                        return (
                            <div key={siloId} className="glass p-4 rounded-lg bg-zinc-900/50 border border-amber/10 relative">
                                <div className="flex justify-between items-start mb-2">
                                    <h4 className="text-lg font-bold text-amber-500 mb-0 mt-0 font-mono">SILO {siloId}</h4>
                                    {inv && editSilo !== siloId && topUpSiloId !== siloId && (
                                        <div className="flex gap-2">
                                            <button className="text-zinc-500 hover:text-white transition-colors" onClick={() => {
                                                setEditSilo(siloId);
                                                setSelectedLotId(inv.lotId);
                                            }}>
                                                <span className="text-[10px] uppercase font-mono">Assign</span>
                                            </button>
                                            <button className="text-zinc-500 hover:text-red-500 transition-colors" onClick={() => handleClear(siloId)}>
                                                <span className="text-[10px] uppercase font-mono">Clear</span>
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {editSilo === siloId ? (
                                    <div className="mt-2 flex flex-col gap-2">
                                        <input
                                            type="text"
                                            placeholder="Search lots..."
                                            className="industrial-input w-full text-xs py-1 px-2"
                                            value={searchTerm}
                                            onChange={e => setSearchTerm(e.target.value)}
                                        />
                                        <select
                                            className="industrial-select w-full text-xs py-1"
                                            value={selectedLotId}
                                            onChange={e => setSelectedLotId(e.target.value)}
                                        >
                                            <option value="">-- Cropster Lot --</option>
                                            {filteredLots.map(l => (
                                                <option key={l.id} value={l.id}>
                                                    {l.name} [{l.id}]
                                                </option>
                                            ))}
                                        </select>
                                        <div className="flex gap-2 items-center">
                                            <label className="text-xs w-24">Initial (kg):</label>
                                            <input
                                                type="number"
                                                className="industrial-input flex-1 text-xs py-1"
                                                value={fillWeightKg}
                                                onChange={e => setFillWeightKg(e.target.value)}
                                                step="0.1"
                                            />
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button className="btn btn-primary flex-1 py-1 text-xs" onClick={() => handleAssign(siloId)} disabled={!selectedLotId}>
                                                SAVE
                                            </button>
                                            <button className="btn btn-secondary py-1 text-xs" onClick={() => setEditSilo(null)}>CANCEL</button>
                                        </div>
                                    </div>
                                ) : topUpSiloId === siloId ? (
                                    <div className="mt-2 flex flex-col gap-2 bg-black/30 p-2 rounded">
                                        <span className="text-xs font-mono text-zinc-400 uppercase">Add Fresh Coffee</span>
                                        <div className="flex gap-2 items-center">
                                            <input
                                                type="number"
                                                className="industrial-input flex-1 text-sm py-1"
                                                value={topUpWeightKg}
                                                onChange={e => setTopUpWeightKg(e.target.value)}
                                                step="0.1"
                                            />
                                            <span className="text-xs text-zinc-500">kg</span>
                                        </div>
                                        <div className="flex gap-2 mt-2">
                                            <button className="btn btn-primary flex-1 py-1 text-xs" onClick={() => handleTopUp(siloId)}>
                                                + ADD
                                            </button>
                                            <button className="btn btn-secondary py-1 px-3 text-xs" onClick={() => setTopUpSiloId(null)}>CANCEL</button>
                                        </div>
                                    </div>
                                ) : inv ? (
                                    <div className="mt-2 flex flex-col justify-between">
                                        <div className="mb-3">
                                            <div className="font-bold text-sm truncate" title={inv.lotName}>{inv.lotName}</div>
                                            <div className="text-[10px] text-zinc-400 font-mono mt-1">LOT ID: {inv.lotId}</div>
                                        </div>
                                        <div className="flex items-end justify-between">
                                            <div>
                                                <div className="text-2xl font-bold font-mono leading-none">
                                                    <span className={inv.currentCalculatedKg <= 1.0 ? "text-red-500" : "text-amber"}>
                                                        {inv.currentCalculatedKg.toFixed(2)}
                                                    </span>
                                                    <span className="text-xs text-zinc-500 ml-1">kg</span>
                                                </div>
                                            </div>
                                            <button
                                                className="btn btn-secondary !bg-amber/10 !text-amber !border-amber/20 hover:!bg-amber hover:!text-black text-[10px] py-1 px-3"
                                                onClick={() => setTopUpSiloId(siloId)}
                                            >
                                                + TOP UP
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="mt-4 flex flex-col items-center justify-center py-4 bg-black/20 rounded border border-dashed border-zinc-800">
                                        <span className="text-zinc-500 text-xs mb-3 font-mono">No lot assigned</span>
                                        <button className="btn btn-secondary !bg-zinc-800 py-1 px-4 text-xs font-mono" onClick={() => {
                                            setEditSilo(siloId);
                                            setSelectedLotId('');
                                            setFillWeightKg('5.0');
                                            setSearchTerm('');
                                        }}> + ASSIGN LOT</button>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
