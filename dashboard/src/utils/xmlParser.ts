import { XMLParser } from 'fast-xml-parser';
import type { ParsedMenuItem } from '../entities/Menu';

const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '',
    parseAttributeValue: true,
});

/**
 * Parse SFWU Menu XML response
 */
export function parseMenuXml(xmlData: string): ParsedMenuItem[] {
    try {
        const result = parser.parse(xmlData);

        // Structure: <menu> <menu_items> <i> ... </i> </menu_items> </menu>
        // fast-xml-parser might simplify this depending on config
        // Let's assume standard structure based on Java entities

        if (!result.menu || !result.menu.menu_items || !result.menu.menu_items.i) {
            console.warn('Invalid menu XML structure', result);
            return [];
        }

        const rawItems = result.menu.menu_items.i;
        // Handle single item case (fast-xml-parser returns object instead of array)
        const itemsArray = Array.isArray(rawItems) ? rawItems : [rawItems];

        return itemsArray.map((item: any) => ({
            id: parseInt(item.id),
            name: item.n, // 'n' attribute/element from MenuItem.java
            graphicId: parseInt(item.gid), // 'gid'
        }));
    } catch (error) {
        console.error('XML Parse Error', error);
        return [];
    }
}
