/**
 * Remembers each unit's view (tab, date, time, zoom height) for the session,
 * so going to Settings and back returns you to exactly what you were looking at.
 */
import { todaySG, nowMinutesSG } from '#lib/sun.ts';

export type View = '3d' | 'top' | 'walk';
interface UnitViewState {
	view: View;
	date: string;
	minutes: number;
}

const states = $state<Record<string, UnitViewState>>({});

export function unitView(id: string): UnitViewState {
	states[id] ??= {
		view: 'top',
		date: todaySG(),
		minutes: Math.max(7 * 60, Math.min(18 * 60, nowMinutesSG()))
	};
	return states[id];
}
