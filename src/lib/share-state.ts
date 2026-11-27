/**
 * View state in share links: #v=top&d=2026-06-21&t=660
 *   v = top | 3d | walk     d = YYYY-MM-DD (2000–2100)     t = minutes after midnight (0–1439)
 * Every value is validated and clamped; anything invalid falls back to the current/default value.
 */
import type { View } from '#lib/stores/unit-view.svelte.ts';

export interface ViewState {
	view: View;
	date: string;
	minutes: number;
}

const VIEWS: View[] = ['top', '3d', 'walk'];

export function parseViewHash(hash: string, fallback: ViewState): ViewState {
	const out = { ...fallback };
	if (!hash || hash.length > 200) return out;
	const q = new URLSearchParams(hash.replace(/^#/, ''));
	const v = q.get('v');
	if (v && (VIEWS as string[]).includes(v)) out.view = v as View;
	const d = q.get('d');
	if (d && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
		const [y, m, day] = d.split('-').map(Number);
		const dt = new Date(Date.UTC(y, m - 1, day));
		if (y >= 2000 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day) out.date = d;
	}
	const t = q.get('t');
	if (t && /^\d{1,4}$/.test(t)) out.minutes = Math.min(1439, Math.max(0, Number(t)));
	return out;
}

export function viewHash(s: ViewState): string {
	return `#v=${s.view}&d=${s.date}&t=${Math.round(Math.min(1439, Math.max(0, s.minutes)))}`;
}
