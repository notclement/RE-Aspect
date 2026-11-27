/**
 * Facing direction + Sun score.
 *
 * FACING: the main windows are the ones that light the living room (the room label matching /living/i —
 * windows whose room outline contains that label, else windows within 7 m of it). If there's no living room label, every window counts.
 * Each window's outward normal is weighted by its glass area (width × glass height), the weighted vectors are
 * summed, and the direction of the sum is the facing (degrees clockwise from north; the plan is north-up).
 *
 * SUN SCORE (out of 10, higher = cooler / less harsh afternoon sun):
 *   For a vertical window facing f, direct sun on the glass at a moment is  cos(alt) · max(0, cos(az − f))
 *   (alt/az = sun altitude/azimuth; zero when the sun is down). We add this up every 20 minutes from
 *   1 pm to sunset on the 21st of every month →  A(f)  = "yearly afternoon sun on that facing".
 *   Amax = the largest A over all 24 facings (the worst facing at this latitude).
 *     score = 10 − 9 · A(f) / Amax      (clamped to 1…10, one decimal)
 *   So the worst possible facing scores 1, a facing that never gets afternoon sun scores 10.
 *   Morning sun is tracked the same way (sunrise → 1 pm) as M(f)/Mmax for the verdict wording only.
 *
 * Neighbouring buildings are NOT included (see "How we worked this out").
 */
import type { Unit } from '#lib/sample-unit.ts';
import { sunPosition, localDate, sunTimes } from '#lib/sun.ts';

const RAD = Math.PI / 180;
const ONE_PM = 13 * 60;

export interface SunScore {
	facingDeg: number;
	facingWords: string; // e.g. "southwest"
	room: string; // e.g. "Living room"
	score: number; // 1–10
	morning: number; // 0–1 share of the best morning facing
	verdict: string;
}

const WORDS: Record<string, string> = {
	N: 'north', NNE: 'north-northeast', NE: 'northeast', ENE: 'east-northeast', E: 'east', ESE: 'east-southeast',
	SE: 'southeast', SSE: 'south-southeast', S: 'south', SSW: 'south-southwest', SW: 'southwest', WSW: 'west-southwest',
	W: 'west', WNW: 'west-northwest', NW: 'northwest', NNW: 'north-northwest'
};

const C16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
/** 16-point compass abbreviation, e.g. 234° → "SW". */
export const compass16 = (deg: number) => C16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16];
/** 16-point compass word, e.g. 234° → "southwest". */
export const facingWords = (deg: number) => WORDS[C16[Math.round((((deg % 360) + 360) % 360) / 22.5) % 16]];

type Sample = { alt: number; az: number; pm: boolean };
const cache = new Map<string, Sample[]>();
function samples(lat: number, lon: number): Sample[] {
	const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
	let s = cache.get(key);
	if (s) return s;
	s = [];
	const year = new Date().getUTCFullYear();
	for (let m = 1; m <= 12; m++) {
		const ymd = `${year}-${String(m).padStart(2, '0')}-21`;
		const t = sunTimes(ymd, lat, lon);
		if (t.sunrise === null || t.sunset === null) continue;
		for (let min = Math.ceil(t.sunrise / 20) * 20; min <= t.sunset; min += 20) {
			const p = sunPosition(localDate(ymd, min), lat, lon);
			if (p.altitude > 0) s.push({ alt: p.altitude * RAD, az: p.azimuth * RAD, pm: min >= ONE_PM });
		}
	}
	cache.set(key, s);
	return s;
}

function exposure(s: Sample[], facingDeg: number): { am: number; pm: number } {
	const f = facingDeg * RAD;
	let am = 0;
	let pm = 0;
	for (const x of s) {
		const v = Math.cos(x.alt) * Math.max(0, Math.cos(x.az - f));
		if (x.pm) pm += v;
		else am += v;
	}
	return { am, pm };
}

function inPoly(x: number, y: number, p: [number, number][]) {
	let hit = false;
	for (let i = 0, j = p.length - 1; i < p.length; j = i++)
		if (p[i][1] > y !== p[j][1] > y && x < ((p[j][0] - p[i][0]) * (y - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) hit = !hit;
	return hit;
}

export function sunScore(unit: Unit): SunScore | null {
	if (!unit.windows.length) return null;
	const living = unit.rooms.find((r) => /living/i.test(r.name));
	const mid = (w: Unit['windows'][number]) => [(w.a[0] + w.b[0]) / 2, (w.a[1] + w.b[1]) / 2];
	let wins = unit.windows;
	if (living) {
		// Windows that light the living room: by their room outline when known, else within 7 m of the label.
		const inRoom = wins.filter((w) => w.room && inPoly(living.x, living.y, w.room));
		const near = wins.filter((w) => Math.hypot(mid(w)[0] - living.x, mid(w)[1] - living.y) < 700);
		if (inRoom.length) wins = inRoom;
		else if (near.length) wins = near;
	}
	let vx = 0;
	let vy = 0;
	for (const w of wins) {
		const area = Math.hypot(w.b[0] - w.a[0], w.b[1] - w.a[1]) * Math.max(10, w.head - w.sill);
		vx += w.normal[0] * area;
		vy += w.normal[1] * area;
	}
	if (Math.hypot(vx, vy) < 1e-6) return null;
	const facingDeg = Math.round(((Math.atan2(vx, -vy) / RAD + unit.bearing) % 360 + 360) % 360);

	const s = samples(unit.lat, unit.lon);
	let amMax = 0;
	let pmMax = 0;
	for (let f = 0; f < 360; f += 15) {
		const e = exposure(s, f);
		amMax = Math.max(amMax, e.am);
		pmMax = Math.max(pmMax, e.pm);
	}
	const e = exposure(s, facingDeg);
	const score = Math.min(10, Math.max(1, Math.round((10 - 9 * (pmMax ? e.pm / pmMax : 0)) * 10) / 10));
	const morning = amMax ? e.am / amMax : 0;
	const room = living ? 'living room' : 'main windows';
	const verdict =
		score >= 7.5
			? morning >= 0.5
				? 'Bright mornings, little afternoon heat'
				: 'Soft, indirect light most of the day'
			: score >= 4.5
				? `Some afternoon sun in the ${room}`
				: `Strong afternoon sun in the ${room}`;
	return { facingDeg, facingWords: facingWords(facingDeg), room: living ? 'Living room' : 'Main windows', score, morning, verdict };
}
