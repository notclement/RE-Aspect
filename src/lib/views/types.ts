import type { Unit } from '#lib/sample-unit.ts';
import type { Patch, FurnitureLight } from '#lib/light.ts';
export type { Unit, Patch, FurnitureLight };
export type Sun = { azimuth: number; altitude: number };
export interface Lighting {
	sun: Sun;
	patches: Patch[];
	dark: number;
	furniture: FurnitureLight;
	/** RE:Aspect: sunlight colour (pale yellow in the morning → warm orange after 1 pm). Defaults to --ochre. */
	sunColor?: string;
}
export interface PlanProps extends Lighting {
	unit: Unit;
	showSun?: boolean;
	grid?: boolean;
	/** RE:Aspect: called when the zoom changes (buttons or pinch), for the % readout. */
	onzoom?: (scale: number) => void;
}
export interface WalkProps extends Lighting {
	unit: Unit;
	eyeLevelCm: number;
	walkSpeed: number;
	lookSensitivity: number;
	onexit?: () => void;
}
export interface PlanControls {
	zoomBy(f: number): void;
	getScale(): number;
	reset(): void;
}
export type Point = [number, number];
export const rad = Math.PI / 180;
export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
