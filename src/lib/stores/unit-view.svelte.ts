/**
 * Remembers each project's view (tab, date, time) for the session,
 * so going to Settings and back returns you to exactly what you were looking at.
 */
import { todaySG, nowMinutesSG } from '#lib/sun.ts';

export type View = '3d' | 'top' | 'walk';

class UnitViewState {
	view = $state<View>('top');
	date = $state(todaySG());
	minutes = $state(Math.max(7 * 60, Math.min(18 * 60, nowMinutesSG())));
}

// Plain Map (not reactive): creating a state object here never mutates existing state, so it's safe inside $derived.
const states = new Map<string, UnitViewState>();

export function unitView(id: string): UnitViewState {
	let s = states.get(id);
	if (!s) states.set(id, (s = new UnitViewState()));
	return s;
}
