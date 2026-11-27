/**
 * Solar position (DayTrace core). Compact NOAA-style approximation, accurate to well under 1°
 * for 1950–2050 — plenty for showing where sunlight lands in a room.
 * Azimuth: degrees clockwise from true north. Altitude: degrees above the horizon.
 */
const RAD = Math.PI / 180;

export interface SunPosition {
	azimuth: number;
	altitude: number;
}

export function sunPosition(date: Date, lat: number, lon: number): SunPosition {
	const d = date.getTime() / 86400000 + 2440587.5 - 2451545.0; // days since J2000
	const g = (357.529 + 0.98560028 * d) * RAD; // mean anomaly
	const q = 280.459 + 0.98564736 * d; // mean longitude
	const L = (q + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD; // ecliptic longitude
	const e = (23.439 - 0.00000036 * d) * RAD; // obliquity
	const ra = Math.atan2(Math.cos(e) * Math.sin(L), Math.cos(L));
	const dec = Math.asin(Math.sin(e) * Math.sin(L));
	const gmst = (18.697374558 + 24.06570982441908 * d) % 24; // hours
	const lst = (gmst * 15 + lon) * RAD;
	const H = lst - ra;
	const phi = lat * RAD;
	const alt = Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
	const az = Math.atan2(-Math.sin(H), Math.tan(dec) * Math.cos(phi) - Math.sin(phi) * Math.cos(H));
	return { azimuth: ((az / RAD) % 360 + 360) % 360, altitude: alt / RAD };
}

/** Singapore has no daylight saving: always UTC+8. */
export const SG_OFFSET_MIN = 8 * 60;

/** Date at `minutes` after local midnight of `ymd` (YYYY-MM-DD) for a fixed UTC offset. */
export function localDate(ymd: string, minutes: number, offsetMin = SG_OFFSET_MIN): Date {
	const [y, m, dd] = ymd.split('-').map(Number);
	return new Date(Date.UTC(y, m - 1, dd, 0, 0) + (minutes - offsetMin) * 60000);
}

/** Sunrise / sunset in local minutes (altitude crosses −0.833°), scanned per minute. */
export function sunTimes(ymd: string, lat: number, lon: number, offsetMin = SG_OFFSET_MIN) {
	let rise: number | null = null;
	let set: number | null = null;
	let prev = sunPosition(localDate(ymd, 0, offsetMin), lat, lon).altitude;
	for (let m = 1; m <= 1440; m++) {
		const a = sunPosition(localDate(ymd, m, offsetMin), lat, lon).altitude;
		if (prev < -0.833 && a >= -0.833 && rise === null) rise = m;
		if (prev >= -0.833 && a < -0.833) set = m;
		prev = a;
	}
	return { sunrise: rise, sunset: set };
}

/** Today's date as YYYY-MM-DD in Singapore time. */
export function todaySG(): string {
	const d = new Date(Date.now() + SG_OFFSET_MIN * 60000);
	return d.toISOString().slice(0, 10);
}

/** Current local minutes after midnight in Singapore. */
export function nowMinutesSG(): number {
	const d = new Date(Date.now() + SG_OFFSET_MIN * 60000);
	return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Compass name for an azimuth, e.g. 225 → "SW". */
export function compass(az: number): string {
	const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
	return names[Math.round(az / 45) % 8];
}
