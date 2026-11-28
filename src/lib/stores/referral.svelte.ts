/**
 * Referrals by QR (migration 0018). Each user has one code; a new account that opens /refer?code=… and signs in
 * claims it once, and both people get 1 month of Pro. The server does every check; this only mirrors replies.
 */
import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
import { errText } from '#lib/stores/agency.svelte.ts';

export interface MyReferral {
	code: string;
	joined: number;
	months: number;
}
export type ClaimResult = 'ok' | 'own' | 'used' | 'old' | 'invalid';

const CODE = /^[A-HJ-NP-Z2-9]{8}$/;
const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(9999, Math.round(Number(v)))) : 0);
const KEY = 'rea.refCode';

/** The link a QR code points to. */
export const referralLink = (code: string) => `${location.origin}/refer?code=${code}`;

/** A scanned referral code survives the sign-in (like agency invites). */
export const pendingRef = {
	get(): string | null {
		try {
			const v = localStorage.getItem(KEY);
			return v && CODE.test(v) ? v : null;
		} catch {
			return null;
		}
	},
	set(code: string | null) {
		try {
			if (code && CODE.test(code)) localStorage.setItem(KEY, code);
			else localStorage.removeItem(KEY);
		} catch {
			/* private mode */
		}
	}
};

export async function myReferral(): Promise<MyReferral | null> {
	if (!supabaseConfigured) return null;
	const sb = await getSupabase();
	const { data, error } = await sb.rpc('my_referral');
	if (error) throw new Error(errText(error));
	const r = (data ?? {}) as Record<string, unknown>;
	const code = typeof r.code === 'string' && CODE.test(r.code) ? r.code : '';
	return code ? { code, joined: int(r.joined), months: Math.min(12, int(r.months)) } : null;
}

/** The first name of the person who shared the code, or null if the code doesn't exist. */
export async function peekReferral(code: string): Promise<string | null> {
	if (!supabaseConfigured || !CODE.test(code)) return null;
	const sb = await getSupabase();
	const { data, error } = await sb.rpc('peek_referral', { p_code: code });
	if (error) throw new Error(errText(error));
	const name = (data as Record<string, unknown> | null)?.name;
	return typeof name === 'string' ? name.replace(/[<>{}\\\u0000-\u001f]/g, '').slice(0, 40) || 'A friend' : null;
}

export async function claimReferral(code: string): Promise<ClaimResult> {
	const sb = await getSupabase();
	const { data, error } = await sb.rpc('claim_referral', { p_code: code });
	if (error) throw new Error(errText(error));
	return (['ok', 'own', 'used', 'old', 'invalid'] as const).find((x) => x === data) ?? 'invalid';
}
