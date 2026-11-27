/**
 * Morning vs afternoon sunlight colour.
 * Pale yellow before 1 pm, warm orange after, blended smoothly between 12:00 and 14:00 (centred on 1 pm),
 * so a buyer can tell at a glance whether a patch of light is gentle morning sun or hot afternoon sun.
 * Used for the floor glow, window beams and furniture tint in all three views. Works in light and dark mode
 * because it's drawn as a translucent overlay on top of the themed floor.
 */
export const MORNING = [246, 226, 122] as const; // #F6E27A pale yellow
export const AFTERNOON = [242, 140, 48] as const; // #F28C30 warm orange

/** 0 = morning colour, 1 = afternoon colour, for local minutes since midnight. */
export function afternoonMix(minutes: number): number {
	const t = Math.min(1, Math.max(0, (minutes - 12 * 60) / 120));
	return t * t * (3 - 2 * t);
}

export function sunColor(minutes: number): string {
	const k = afternoonMix(minutes);
	const c = MORNING.map((m, i) => Math.round(m + (AFTERNOON[i] - m) * k));
	return '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
}
