/**
 * Singapore address search via OneMap (Singapore Land Authority, free, no key needed for search).
 * Used to turn an address / postal code into coordinates for the sun calculation.
 */
export interface Place {
	label: string;
	postal: string;
	lat: number;
	lon: number;
}

export async function searchAddress(q: string, signal?: AbortSignal): Promise<Place[]> {
	const v = q.trim();
	if (v.length < 3) return [];
	const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(v)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
	const res = await fetch(url, { signal });
	if (!res.ok) throw new Error('Address search is unavailable right now.');
	const data = (await res.json()) as { results?: Record<string, string>[] };
	return (data.results ?? [])
		.slice(0, 6)
		.map((r) => ({
			label: (r.ADDRESS ?? '').replace(/\s+/g, ' ').trim(),
			postal: r.POSTAL ?? '',
			lat: Number(r.LATITUDE),
			lon: Number(r.LONGITUDE)
		}))
		.filter((p) => p.label && Number.isFinite(p.lat) && Number.isFinite(p.lon) && p.lat > 1 && p.lat < 1.6 && p.lon > 103.5 && p.lon < 104.2);
}
