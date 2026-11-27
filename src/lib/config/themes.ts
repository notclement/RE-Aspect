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
	{ id: 'light', label: 'Basic light', tagline: 'Warm paper, forest green', mode: 'light', swatch: ['#f5f3ec', '#2f4a3b', '#b07a2a', '#d6caae'] },
	{ id: 'dark', label: 'Basic dark', tagline: 'Easy on the eyes at night', mode: 'dark', swatch: ['#101311', '#6f9c80', '#e2a64e', '#7d7566'] },
	{ id: 'japandi', label: 'Japandi & Wabi-Sabi', tagline: 'Washi, charcoal, raw clay — calm and quiet', mode: 'light', swatch: ['#e7dfd1', '#2e2a27', '#a0643a', '#c6b597'] },
	{ id: 'scandi', label: 'Scandinavian', tagline: 'Airy whites, fjord blue, birch', mode: 'light', swatch: ['#eef3f7', '#1f4a66', '#d9773a', '#c9d6de'] },
	{ id: 'modern', label: 'Modern Contemporary', tagline: 'Crisp black & white, brass, sharp edges', mode: 'light', swatch: ['#ffffff', '#0a0a0a', '#b8913f', '#b9b9b6'] },
	{ id: 'industrial', label: 'Industrial', tagline: 'Concrete, steel and copper', mode: 'dark', swatch: ['#17181a', '#d2703c', '#f0b35c', '#6b6761'] },
	{ id: 'peranakan', label: 'Eclectic & Peranakan', tagline: 'Jade, Nyonya pink, gold — retro heritage', mode: 'light', swatch: ['#fdeee9', '#0b6e66', '#d1567a', '#b9d8d1'] },
	{ id: 'tropical', label: 'Resort / Tropical', tagline: 'Sand, ocean teal, sunset coral', mode: 'light', swatch: ['#f3e6c8', '#0b6b74', '#ef6a3a', '#c4ad82'] }
];

export const THEME_IDS = THEMES.map((t) => t.id);
export const isThemeId = (v: unknown): v is ThemeId => typeof v === 'string' && (THEME_IDS as string[]).includes(v);
export const themeDef = (id: ThemeId) => THEMES.find((t) => t.id === id)!;
