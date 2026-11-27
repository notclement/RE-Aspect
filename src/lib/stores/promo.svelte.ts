/**
 * Admin promo: "everyone gets Pro for N days" (migration 0012). The server applies it to every limit;
 * the app shows the message as a banner once per promo, then keeps it behind a small gift button (top right).
 */
import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';

export interface Promo {
	id: string;
	message: string;
	endsAt: string;
}

const SEEN_KEY = 'rea.promoSeen';
const clean = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/[<>{}\\\u0000-\u001f]/g, '').slice(0, n) : '');

class PromoStore {
	current = $state<Promo | null>(null);
	/** Banner open right now (first time automatically; later only when the user taps the gift button). */
	open = $state(false);

	get active() {
		return !!this.current && new Date(this.current.endsAt).getTime() > Date.now();
	}

	async refresh() {
		if (!supabaseConfigured) return;
		try {
			const sb = await getSupabase();
			const { data, error } = await sb.rpc('active_promo');
			if (error) throw error;
			const r = (data ?? null) as Record<string, unknown> | null;
			const id = clean(r?.id, 40);
			const endsAt = clean(r?.endsAt, 40);
			this.current = id && endsAt && !Number.isNaN(Date.parse(endsAt)) ? { id, message: clean(r?.message, 280), endsAt } : null;
			if (this.current && localStorage.getItem(SEEN_KEY) !== this.current.id) this.open = true;
		} catch (e) {
			console.warn('[promo] could not load', e);
		}
	}

	dismiss() {
		this.open = false;
		try {
			if (this.current) localStorage.setItem(SEEN_KEY, this.current.id);
		} catch {
			/* ignore */
		}
	}

	clear() {
		this.current = null;
		this.open = false;
	}

	async start(days: number, message: string) {
		const sb = await getSupabase();
		const { error } = await sb.rpc('admin_start_promo', { p_days: days, p_message: message });
		if (error) throw new Error(error.message);
		await this.refresh();
	}
	/** Admin: all promos (newest first). */
	async list(): Promise<{ id: string; message: string; startsAt: string; endsAt: string; active: boolean }[]> {
		const sb = await getSupabase();
		const { data, error } = await sb.rpc('admin_list_promos');
		if (error) throw new Error(error.message);
		return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
			id: clean(r.id, 40),
			message: clean(r.message, 280),
			startsAt: clean(r.starts_at, 40),
			endsAt: clean(r.ends_at, 40),
			active: r.active === true
		}));
	}
	/** Admin: delete a promo. Deleting the running one ends it immediately. */
	async remove(id: string) {
		const sb = await getSupabase();
		const { error } = await sb.rpc('admin_delete_promo', { p_id: id });
		if (error) throw new Error(error.message);
		if (this.current?.id === id) this.clear();
		else await this.refresh();
	}
	async end() {
		const sb = await getSupabase();
		const { error } = await sb.rpc('admin_end_promo');
		if (error) throw new Error(error.message);
		this.clear();
	}
}

export const promo = new PromoStore();
