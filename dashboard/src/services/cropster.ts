/**
 * CropsterService — API Client for fetching Cropster inventory
 * Connects to c-sar.cropster.com via Basic AuthREST API v2
 */

import { logger } from '../utils/logger';

// Default keys from user input 
const DEFAULT_CLIENT_ID = "305de0edc0f643869f15610df0f44fd6";
const DEFAULT_CLIENT_SECRET = "b0b41510c5b31ed134614ea4995bf687a79c9c606ca910d231b075cbe6a633be";
const GROUP = "SCANO";
const BASE_URL = "/api/v2";

export interface CropsterLot {
    id: string;
    name: string;
    type: 'green' | 'roasted' | 'blended';
    weightAmount: number;
    weightUnit: string;
    erpId: string | null;
    createdAt: string;
}

export class CropsterService {
    private static instance: CropsterService;
    private clientId: string = DEFAULT_CLIENT_ID;
    private clientSecret: string = DEFAULT_CLIENT_SECRET;
    private cachedLots: CropsterLot[] | null = null;
    private lastFetch: number = 0;

    private constructor() { }

    public static getInstance(): CropsterService {
        if (!CropsterService.instance) {
            CropsterService.instance = new CropsterService();
        }
        return CropsterService.instance;
    }

    private getHeaders() {
        const creds = btoa(`${this.clientId}:${this.clientSecret}`);
        return {
            "Accept": "application/json",
            "Authorization": `Basic ${creds}`
        };
    }

    /**
     * Fetch all active roasted and blended lots, as those are what go into silos.
     */
    public async fetchSiloCandidateLots(forceRefresh = false): Promise<CropsterLot[]> {
        // Cache for 5 minutes
        if (!forceRefresh && this.cachedLots && (Date.now() - this.lastFetch < 5 * 60 * 1000)) {
            return this.cachedLots;
        }

        try {
            logger.info('Cropster', 'Fetching lots from Cropster SDK...');

            // We fetch roasted and blended lots since green coffee isn't dispensed into a cup.
            // Using Promise.all to fetch both in parallel.
            const [roastedRes, blendedRes] = await Promise.all([
                fetch(`${BASE_URL}/lots?filter[lots][group]=${GROUP}&filter[type]=roasted&page[size]=50`, { headers: this.getHeaders() }),
                fetch(`${BASE_URL}/lots?filter[lots][group]=${GROUP}&filter[type]=blended&page[size]=50`, { headers: this.getHeaders() })
            ]);

            if (!roastedRes.ok) throw new Error(`Roasted lots HTTP ${roastedRes.status}`);
            if (!blendedRes.ok) throw new Error(`Blended lots HTTP ${blendedRes.status}`);

            const roastedData = await roastedRes.json();
            const blendedData = await blendedRes.json();

            const allLots: CropsterLot[] = [];

            const parseLot = (item: any): CropsterLot => {
                const attr = item.attributes || {};
                const w = attr.weight || {};
                return {
                    id: item.id,
                    name: attr.name || 'Unknown',
                    type: attr.type || 'unknown',
                    weightAmount: w.amount || 0,
                    weightUnit: w.unit || 'kg',
                    erpId: attr.erpId || null,
                    createdAt: attr.created || new Date().toISOString()
                };
            };

            if (roastedData.data) {
                allLots.push(...roastedData.data.map(parseLot));
            }
            if (blendedData.data) {
                allLots.push(...blendedData.data.map(parseLot));
            }

            // Also check green lots just in case users physically load green beans into a silo for display/storage
            const greenRes = await fetch(`${BASE_URL}/lots?filter[lots][group]=${GROUP}&filter[type]=green&page[size]=50`, { headers: this.getHeaders() });
            if (greenRes.ok) {
                const greenData = await greenRes.json();
                if (greenData.data) {
                    allLots.push(...greenData.data.map(parseLot));
                }
            }

            // Sort newest first
            allLots.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

            this.cachedLots = allLots;
            this.lastFetch = Date.now();

            logger.info('Cropster', `Successfully loaded ${allLots.length} lots`);
            return this.cachedLots;

        } catch (error) {
            logger.error('Cropster', 'Failed to fetch lots', error);
            throw error;
        }
    }
}

export const cropsterClient = CropsterService.getInstance();
