/**
 * App themes. Colours / shapes / type live in src/themes.css under [data-theme='<id>'].
 * `mode` decides light-vs-dark details (plan floor tones, browser UI) via <html data-mode>.
 * Similar styles are combined: Japandi + Minimalist/Wabi-Sabi, Eclectic/Retro + Heritage/Peranakan.
 */
export type ThemeId =
	| 'light'
	| 'dark'
	| 'japandi'
	| 'scandi'
	| 'modern'
	| 'industrial'
	| 'peranakan'
	| 'tropical';

export interface ThemeDef {
	id: ThemeId;
	label: string;
	tagline: string;
	mode: 'light' | 'dark';
	/** Swatches for the picker: background, primary, accent, soft. */
	swatch: [string, string, string, string];
}

export const THEMES: ThemeDef[] = [
	{ id: 'light', label: 'Basic light', tagline: 'Warm paper, forest green', mode: 'light', swatch: ['#f7f6f1', '#2f4a3b', '#b07a2a', '#eeede6'] },
	{ id: 'dark', label: 'Basic dark', tagline: 'Easy on the eyes at night', mode: 'dark', swatch: ['#141815', '#5f8a70', '#d39a45', '#262c27'] },
	{ id: 'japandi', label: 'Japandi & Wabi-Sabi', tagline: 'Washi, charcoal, raw clay — calm and quiet', mode: 'light', swatch: ['#ece6dc', '#3b3631', '#9a6b47', '#ddd4c6'] },
	{ id: 'scandi', label: 'Scandinavian', tagline: 'Airy whites, fjord blue, birch', mode: 'light', swatch: ['#f4f7f8', '#3d5a6c', '#c98a4b', '#e6ecef'] },
	{ id: 'modern', label: 'Modern Contemporary', tagline: 'Crisp black & white, brass, sharp edges', mode: 'light', swatch: ['#fafafa', '#111111', '#b8913f', '#ececec'] },
	{ id: 'industrial', label: 'Industrial', tagline: 'Concrete, steel and copper', mode: 'dark', swatch: ['#1b1c1d', '#c8693a', '#e0a458', '#2f3235'] },
	{ id: 'peranakan', label: 'Eclectic & Peranakan', tagline: 'Jade, Nyonya pink, gold — retro heritage', mode: 'light', swatch: ['#fbf0ec', '#0f7f76', '#c38a22', '#f6d3db'] },
	{ id: 'tropical', label: 'Resort / Tropical', tagline: 'Sand, ocean teal, sunset coral', mode: 'light', swatch: ['#f6efdf', '#0e7c86', '#e2703f', '#e6efe9'] }
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const isThemeId = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as string[]).includes(v);
export const themeDef = (id: ThemeId) => THEMES.find((t) => t.id === id)!;
