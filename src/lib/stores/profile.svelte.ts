/**
 * The user's profile + personal settings.
 * Phase 0: stored in this browser. Phase 1: synced to the Supabase `profiles` table on sign-in.
 */
import { effectivePlan, type PlanId } from '#lib/config/plans.ts';

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
	bodyHeightCm: number; // walkthrough eye level ≈ height − 12 cm
	areaUnit: 'sqft' | 'sqm';
	clock: '12h' | '24h';
	walkSpeed: number; // m/s
	lookSensitivity: number; // 1 = default
	isAdmin: boolean; // mirrored from the server on sign-in
	showSunMarker: boolean; // show the sun disc (position in the sky) on the plan
}

const KEY = 'rea.profile';
const DEFAULTS: Profile = {
	name: '',
	plan: 'free',
	bodyHeightCm: 170,
	areaUnit: 'sqft',
	clock: '12h',
	walkSpeed: 1.3,
	lookSensitivity: 1,
	isAdmin: false,
	showSunMarker: false
};
const VIEW_KEY = 'rea.viewAs';

class ProfileStore {
	data = $state<Profile>({ ...DEFAULTS });
	loaded = $state(false);
	/** Admin-only preview role (null = see the app as yourself). */
	viewAs = $state<RoleView | null>(null);

	load() {
		try {
			const raw = localStorage.getItem(KEY);
			if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
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
		return this.data.plan === 'agency' ? 'agency' : this.data.plan;
	}

	/** Plan whose limits the UI shows (a "view as" preview ignores the free-launch upgrade). */
	get planId(): PlanId {
		const r = this.viewAs;
		if (r) return r === 'free' ? 'free' : r === 'agency' || r === 'lead' ? 'agency' : 'pro';
		return this.data.isAdmin ? 'pro' : effectivePlan(this.data.plan);
	}

	update(patch: Partial<Profile>) {
		this.data = { ...this.data, ...patch };
		try {
			localStorage.setItem(KEY, JSON.stringify(this.data));
		} catch {
			/* ignore */
		}
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
