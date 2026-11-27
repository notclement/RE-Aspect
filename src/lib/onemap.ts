/**
 * Singapore address search → coordinates.
 * 1. Our `geocode` edge function (OneMap, using a server-held login — OneMap needs a token now).
 * 2. If OneMap isn't set up (or fails), OpenStreetMap Nominatim straight from the browser
 *    (Nominatim blocks cloud servers; it allows light use from browsers — we only search on demand).
 */
import { getSupabase, supabaseConfigured } from './supabase.ts';

export interface Place {
	label: string;
	postal: string;
	lat: number;
	lon: number;
}

const inSG = (p: Place) => !!p.label && p.lat > 1.1 && p.lat < 1.5 && p.lon > 103.5 && p.lon < 104.1;

async function viaServer(q: string): Promise<Place[] | null> {
	if (!supabaseConfigured) return null;
	try {
		const sb = await getSupabase();
		const { data: s } = await sb.auth.getSession();
		if (!s.session) return null;
		const { data, error } = await sb.functions.invoke('geocode', { body: { q } });
		if (error) return null;
		const d = data as { results?: Place[]; fallback?: boolean };
		if (d?.fallback) return null;
		return d?.results ?? [];
	} catch {
		return null;
	}
}

async function viaBrowser(q: string, signal?: AbortSignal): Promise<Place[]> {
	const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=sg&addressdetails=1&limit=6&q=${encodeURIComponent(q)}`;
	const r = await fetch(url, { signal, headers: { 'Accept-Language': 'en' } });
	if (!r.ok) throw new Error('Address search is unavailable right now.');
	const d = (await r.json()) as { display_name: string; lat: string; lon: string; address?: { postcode?: string } }[];
	return d.map((x) => ({
		label: x.display_name.replace(/,?\s*(Central|East|North|North-East|West) Region/i, '').replace(/,\s*Singapore$/i, '').toUpperCase(),
		postal: x.address?.postcode ?? '',
		lat: Number(x.lat),
		lon: Number(x.lon)
	}));
}

export async function searchAddress(q: string, signal?: AbortSignal): Promise<Place[]> {
	const v = q.trim().replace(/[<>{}\\]/g, '').slice(0, 80);
	if (v.length < 3) return [];
	const server = await viaServer(v);
	if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
	const list = server ?? (await viaBrowser(v, signal));
	return list
		.map((p) => ({ label: String(p.label).slice(0, 120), postal: String(p.postal ?? '').slice(0, 6), lat: Number(p.lat), lon: Number(p.lon) }))
		.filter(inSG)
		.slice(0, 6);
}
