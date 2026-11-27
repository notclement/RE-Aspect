/**
 * Remembers each unit's view (tab, date, time, zoom height) for the session,
 * so going to Settings and back returns you to exactly what you were looking at.
 */
import { todaySG, nowMinutesSG } from '#lib/sun.ts';
import { SAMPLE_UNITS } from '#lib/sample-unit.ts';

export type View = '3d' | 'top' | 'walk';
interface UnitViewState {
	view: View;
	date: string;
	minutes: number;
}

const fresh = (): UnitViewState => ({
	view: 'top',
	date: todaySG(),
	minutes: Math.max(7 * 60, Math.min(18 * 60, nowMinutesSG()))
});
// Pre-seeded so reading a project's state never has to create it (safe inside $derived).
const states = $state<Record<string, UnitViewState>>(Object.fromEntries(SAMPLE_UNITS.map((u) => [u.id, fresh()])));

export function unitView(id: string): UnitViewState {
	return states[id] ?? states[SAMPLE_UNITS[0].id];
}
