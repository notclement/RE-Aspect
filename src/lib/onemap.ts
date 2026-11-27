/**
 * Singapore address search → coordinates, via our `geocode` edge function
 * (OneMap with a server-held login; OpenStreetMap as a fallback). Needs a signed-in user.
 */
import { getSupabase, supabaseConfigured } from './supabase.ts';

export interface Place {
	label: string;
	postal: string;
	lat: number;
	lon: number;
}

export async function searchAddress(q: string, signal?: AbortSignal): Promise<Place[]> {
	const v = q.trim();
	if (v.length < 3) return [];
	if (!supabaseConfigured) throw new Error('Address search needs sign-in (not available in preview mode).');
	const sb = await getSupabase();
	const { data: s } = await sb.auth.getSession();
	const { data, error } = await sb.functions.invoke('geocode', {
		body: { q: v },
		headers: s.session ? { Authorization: `Bearer ${s.session.access_token}` } : undefined
	});
	if (signal?.aborted) throw new DOMException('aborted', 'AbortError');
	if (error) throw new Error('Address search is unavailable right now.');
	const list = (data as { results?: Place[] })?.results ?? [];
	return list
		.filter((p) => typeof p.label === 'string' && Number.isFinite(p.lat) && Number.isFinite(p.lon))
		.map((p) => ({ label: p.label.slice(0, 120), postal: String(p.postal ?? '').slice(0, 6), lat: p.lat, lon: p.lon }))
		.slice(0, 6);
}
