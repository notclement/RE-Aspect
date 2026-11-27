/** Furniture presets for Studio (sizes in cm; Singapore-typical). */
import type { Item } from '#lib/sample-unit.ts';

export interface Preset {
	id: string;
	label: string;
	kind: Item['kind'];
	w: number;
	d: number;
	h: number;
	color: string;
	r?: number;
}

export const PRESETS: Preset[] = [
	{ id: 'bed-s', label: 'Single bed', kind: 'bed', w: 107, d: 190, h: 50, color: '#B7BE9C', r: 10 },
	{ id: 'bed-q', label: 'Queen bed', kind: 'bed', w: 152, d: 190, h: 50, color: '#B7BE9C', r: 10 },
	{ id: 'bed-k', label: 'King bed', kind: 'bed', w: 183, d: 190, h: 50, color: '#B7BE9C', r: 10 },
	{ id: 'sofa-2', label: 'Sofa, 2-seat', kind: 'sofa', w: 160, d: 85, h: 80, color: '#9DAE8F', r: 14 },
	{ id: 'sofa-3', label: 'Sofa, 3-seat', kind: 'sofa', w: 210, d: 90, h: 80, color: '#9DAE8F', r: 14 },
	{ id: 'dining', label: 'Dining table', kind: 'table', w: 150, d: 85, h: 75, color: '#9C7A57', r: 6 },
	{ id: 'coffee', label: 'Coffee table', kind: 'table', w: 100, d: 55, h: 45, color: '#EFE8DA', r: 8 },
	{ id: 'chair', label: 'Chair', kind: 'chair', w: 50, d: 50, h: 85, color: '#A68B6D', r: 6 },
	{ id: 'desk', label: 'Desk', kind: 'desk', w: 120, d: 60, h: 75, color: '#9C7A57', r: 4 },
	{ id: 'wardrobe', label: 'Wardrobe', kind: 'wardrobe', w: 120, d: 60, h: 210, color: '#7F7766', r: 3 },
	{ id: 'tv', label: 'TV console', kind: 'console', w: 160, d: 40, h: 50, color: '#8E6F52', r: 3 },
	{ id: 'counter', label: 'Kitchen counter', kind: 'counter', w: 200, d: 60, h: 90, color: '#C9CBC2', r: 3 },
	{ id: 'bath', label: 'Basin / WC', kind: 'bath', w: 80, d: 60, h: 60, color: '#E9ECE6', r: 8 },
	{ id: 'rug', label: 'Rug', kind: 'rug', w: 200, d: 140, h: 1, color: '#CDBFA8', r: 6 },
	{ id: 'plant', label: 'Plant', kind: 'plant', w: 40, d: 40, h: 120, color: '#6E8A5E', r: 20 }
];

export const KIND_LABEL: Record<Item['kind'], string> = {
	bed: 'Bed',
	sofa: 'Sofa',
	table: 'Table',
	chair: 'Chair',
	desk: 'Desk',
	wardrobe: 'Wardrobe',
	console: 'TV console',
	counter: 'Counter',
	bath: 'Basin / WC',
	rug: 'Rug',
	plant: 'Plant'
};
