/**
 * The user's profile + personal settings.
 * Phase 0: stored in this browser. Phase 1: synced to the Supabase `profiles` table on sign-in.
 */
import type { PlanId } from '#lib/config/plans.ts';

export interface Profile {
	name: string;
	plan: PlanId;
	bodyHeightCm: number; // walkthrough eye level ≈ height − 12 cm
	areaUnit: 'sqft' | 'sqm';
	clock: '12h' | '24h';
	walkSpeed: number; // m/s
	lookSensitivity: number; // 1 = default
}

const KEY = 'rea.profile';
const DEFAULTS: Profile = {
	name: '',
	plan: 'free',
	bodyHeightCm: 170,
	areaUnit: 'sqft',
	clock: '12h',
	walkSpeed: 1.3,
	lookSensitivity: 1
};

class ProfileStore {
	data = $state<Profile>({ ...DEFAULTS });
	loaded = $state(false);

	load() {
		try {
			const raw = localStorage.getItem(KEY);
			if (raw) this.data = { ...DEFAULTS, ...JSON.parse(raw) };
		} catch {
			/* ignore corrupt data */
		}
		this.loaded = true;
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
