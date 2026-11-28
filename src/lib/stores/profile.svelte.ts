/**
 * The user's profile + personal settings.
 * Phase 0: stored in this browser. Phase 1: synced to the Supabase `profiles` table on sign-in.
 */
import { PLANS, type PlanId } from '#lib/config/plans.ts';
import { promo } from './promo.svelte.ts';
import { theme, isThemeChoice, type ThemeChoice } from './theme.svelte.ts';
import { agency } from './agency.svelte.ts';

/**
 * Roles the app can show. `isAdmin` comes from the server (profiles.is_admin) and can't be set from the browser.
 * Admins can "view as" any role to preview the app — this only changes what the UI shows;
 * the server keeps enforcing the real permissions.
 */
export type RoleView = 'free' | 'pro' | 'agency' | 'lead' | 'admin';
export const ROLE_LABELS: Record<RoleView, string> = {
	free: 'Free user',
	pro: 'RE:Aspect Pro',
	agency: 'Agency member',
	lead: 'Agency Lead',
	admin: 'Admin'
};

export interface Profile {
	name: string;
	plan: PlanId;
	proUntil: string | null; // granted Pro end date (ISO), 'infinity' = lifetime, null = none
	avatar: string | null; // tiny square profile photo (data URL, ≤16 KB), synced via profiles.avatar
	extraProjects: number; // bought with Stripe (migration 0019): Pro limit = 10 + this
	disabled: boolean; // set by an admin; the app shows a notice and stops working for this account
	bodyHeightCm: number; // walkthrough eye level ≈ height − 12 cm
	areaUnit: 'sqft' | 'sqm';
	clock: '12h' | '24h';
	walkSpeed: number; // m/s
	lookSensitivity: number; // 1 = default
	isAdmin: boolean; // mirrored from the server on sign-in
	nightSpeed: number; // Auto sun: how much faster night plays than daytime (1–10×, default 5×)
}

const KEY = 'rea.profile';
const DEFAULTS: Profile = {
	name: '',
	plan: 'free',
	proUntil: null,
	avatar: null,
	extraProjects: 0,
	disabled: false,
	bodyHeightCm: 175,
	areaUnit: 'sqft',
	clock: '12h',
	walkSpeed: 1.8,
	lookSensitivity: 1.5,
	isAdmin: false,
	nightSpeed: 5
};
export const NIGHT_SPEED_MIN = 1;
export const NIGHT_SPEED_MAX = 10; // default 5×, ± 5 (1 is the slowest that still moves)

/** Personal settings that sync to the account (profiles.settings) so they follow the user across devices. */
const SETTING_KEYS = ['bodyHeightCm', 'areaUnit', 'clock', 'walkSpeed', 'lookSensitivity', 'nightSpeed'] as const;
type SettingKey = (typeof SETTING_KEYS)[number];
export type Settings = Pick<Profile, SettingKey> & { theme: ThemeChoice };

const clamp = (v: unknown, lo: number, hi: number) => {
	const n = Number(v);
	return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : undefined;
};
/** Validate settings read from the server / storage: unknown keys dropped, numbers clamped, enums checked. */
export function sanitizeSettings(raw: unknown): Partial<Settings> {
	if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
	const r = raw as Record<string, unknown>;
	const out: Partial<Settings> = {};
	const h = clamp(r.bodyHeightCm, 100, 230);
	if (h !== undefined) out.bodyHeightCm = Math.round(h);
	if (r.areaUnit === 'sqft' || r.areaUnit === 'sqm') out.areaUnit = r.areaUnit;
	if (r.clock === '12h' || r.clock === '24h') out.clock = r.clock;
	const ws = clamp(r.walkSpeed, 0.5, 3);
	if (ws !== undefined) out.walkSpeed = ws;
	const ls = clamp(r.lookSensitivity, 0.3, 3);
	if (ls !== undefined) out.lookSensitivity = ls;
	const ns = clamp(r.nightSpeed, NIGHT_SPEED_MIN, NIGHT_SPEED_MAX);
	if (ns !== undefined) out.nightSpeed = ns;
	if (isThemeChoice(r.theme)) out.theme = r.theme;
	return out;
}
const VIEW_KEY = 'rea.viewAs';

class ProfileStore {
	data = $state<Profile>({ ...DEFAULTS });
	loaded = $state(false);
	/** Called after a synced setting changes (auth uses it to save to the account). */
	onSettingsChange: (() => void) | null = null;
	/** Admin-only preview role (null = see the app as yourself). */
	viewAs = $state<RoleView | null>(null);

	load() {
		try {
			const raw = localStorage.getItem(KEY);
			if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
			const ns = Number(this.data.nightSpeed);
			this.data.nightSpeed = Number.isFinite(ns) ? Math.min(NIGHT_SPEED_MAX, Math.max(NIGHT_SPEED_MIN, ns)) : DEFAULTS.nightSpeed;
			const v = localStorage.getItem(VIEW_KEY) as RoleView | null;
			this.viewAs = this.data.isAdmin && v && v in ROLE_LABELS ? v : null;
		} catch {
			/* ignore corrupt data */
		}
		this.loaded = true;
	}

	setViewAs(role: RoleView | null) {
		this.viewAs = this.data.isAdmin ? role : null;
		try {
			if (this.viewAs) localStorage.setItem(VIEW_KEY, this.viewAs);
			else localStorage.removeItem(VIEW_KEY);
		} catch {
			/* ignore */
		}
	}

	/** The role the UI is currently showing. */
	get role(): RoleView {
		if (this.viewAs) return this.viewAs;
		if (this.data.isAdmin) return 'admin';
		if (agency.isLead) return 'lead';
		if (agency.active) return 'agency';
		return this.data.plan === 'agency' ? 'agency' : this.data.plan;
	}

	/** Plan whose limits the UI shows (same rules as the server's effective_plan; a "view as" preview shows that role). */
	get planId(): PlanId {
		const r = this.viewAs;
		if (r) return r === 'free' ? 'free' : r === 'agency' || r === 'lead' ? 'agency' : 'pro';
		if (agency.active) return 'agency';
		if (this.data.isAdmin || this.data.plan === 'pro') return 'pro';
		return promo.active ? 'pro' : 'free';
	}
	/** Is the user on Pro only because of a running promo? */
	get onPromo(): boolean {
		return !this.viewAs && !this.data.isAdmin && !agency.active && this.data.plan !== 'pro' && promo.active;
	}

	/** AI re-runs per project to show: admins (not previewing another role) are unlimited on the server. */
	get aiRunsLabel(): string {
		if (this.data.isAdmin && !this.viewAs) return '∞';
		return String(PLANS[this.planId].aiRunsPerFunctionPerUnit); // Free 5 · Pro 25 · Agency 25
	}

	update(patch: Partial<Profile>, fromCloud = false) {
		this.data = { ...this.data, ...patch };
		try {
			localStorage.setItem(KEY, JSON.stringify(this.data));
		} catch {
			/* ignore */
		}
		if (!fromCloud && Object.keys(patch).some((k) => (SETTING_KEYS as readonly string[]).includes(k))) this.onSettingsChange?.();
	}

	/** Current synced settings (incl. theme). */
	get settings(): Settings {
		const s = Object.fromEntries(SETTING_KEYS.map((k) => [k, this.data[k]])) as Pick<Profile, SettingKey>;
		return { ...s, theme: theme.choice };
	}

	/** Apply settings loaded from the account (already sanitised) without echoing them back. */
	applySettings(s: Partial<Settings>) {
		const { theme: t, ...rest } = s;
		if (Object.keys(rest).length) this.update(rest, true);
		if (t) theme.set(t, true);
	}

	get firstName() {
		return this.data.name.split(' ')[0] ?? '';
	}

	/** Camera eye level for the walkthrough, in cm. */
	get eyeLevelCm() {
		return Math.max(90, this.data.bodyHeightCm - 12);
	}
}

export const profile = new ProfileStore();

/** "Good morning" / "Good afternoon" / "Good evening" for the user's local time. */
export function greeting(date = new Date()): string {
	const h = date.getHours();
	if (h < 12) return 'Good morning';
	if (h < 18) return 'Good afternoon';
	return 'Good evening';
}
