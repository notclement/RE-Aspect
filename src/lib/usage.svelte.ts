/** Project quota as the UI shows it (the server enforces the same: Free 1 · Pro 10 · Agency pool · Admin ∞). */
import { PLANS } from '#lib/config/plans.ts';
import { profile } from '#lib/stores/profile.svelte.ts';
import { agency } from '#lib/stores/agency.svelte.ts';
import { myProjects } from '#lib/stores/projects.svelte.ts';

export function projectUsage(): { used: number; limit: number | null; full: boolean; near: boolean } {
	let used = myProjects.length;
	let limit: number | null;
	if (agency.active && agency.info && !profile.viewAs) {
		used = agency.info.used;
		limit = agency.info.pool;
	} else if (profile.data.isAdmin && !profile.viewAs) {
		limit = null; // admins: unlimited
	} else {
		limit = PLANS[profile.planId].includedUnits;
		if (limit !== null && profile.planId === 'pro') limit += profile.data.extraProjects; // bought extra projects (0019)
	}
	const full = limit !== null && used >= limit;
	const near = limit !== null && !full && limit > 1 && used / limit >= 0.8;
	return { used, limit, full, near };
}
