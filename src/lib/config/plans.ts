/**
 * Plan entitlements (decided 27 Nov 2026 — see docs/REQUIREMENTS.md §Tiers).
 * The SERVER is the source of truth for enforcement; this file mirrors the rules for the UI.
 * Prices are in SGD.
 */
export type PlanId = 'free' | 'pro' | 'agency';

/** Safety cap (server, 0010): AI runs per person per day across all projects; admins exempt. */
export const AI_DAILY_CAP = 40;

export interface Plan {
	id: PlanId;
	label: string;
	priceSgdMonthly: number | null; // null = custom quote
	includedUnits: number | null; // null = computed (agency pool)
	extraUnitOneOffSgd: number | null;
	aiRunsPerFunctionPerUnit: number;
	canImport: boolean;
	canExport: boolean; // export = QR link to our backend, never a downloaded file
	modules: boolean; // Feng Shui / BaZi etc.
	shareLinks: boolean;
}

export const PLANS: Record<PlanId, Plan> = {
	free: {
		id: 'free',
		label: 'Free',
		priceSgdMonthly: 0,
		includedUnits: 1,
		extraUnitOneOffSgd: null,
		aiRunsPerFunctionPerUnit: 5,
		canImport: false,
		canExport: true,
		modules: false,
		shareLinks: true
	},
	pro: {
		id: 'pro',
		label: 'RE:Aspect Pro',
		priceSgdMonthly: 50,
		includedUnits: 10,
		extraUnitOneOffSgd: 5, // each unit beyond 10 is a one-off $5
		aiRunsPerFunctionPerUnit: 25,
		canImport: true,
		canExport: true,
		modules: true,
		shareLinks: true
	},
	agency: {
		id: 'agency',
		label: 'Agency',
		priceSgdMonthly: null, // custom quote
		includedUnits: null, // see agencyUnitPool()
		extraUnitOneOffSgd: 5,
		aiRunsPerFunctionPerUnit: 25,
		canImport: true,
		canExport: true,
		modules: true,
		shareLinks: true
	}
};

/** Each paid seat = 10 units × 1.25, rounded UP to the nearest 10. 10 seats → 130. */
export const AGENCY_UNIT_MULTIPLIER = 1.25;
export function agencyUnitPool(paidSeats: number): number {
	if (!Number.isFinite(paidSeats) || paidSeats <= 0) return 0;
	return Math.ceil((paidSeats * 10 * AGENCY_UNIT_MULTIPLIER) / 10) * 10;
}

/** The Agency Lead is ON TOP of paid seats: 10 paid seats → 11 members. */
export function agencyMemberLimit(paidSeats: number): number {
	return Math.max(0, Math.floor(paidSeats)) + 1;
}

/**
 * Launch period: everything is free while we test with real users.
 * Limits stay built in; everyone is simply treated as Pro until payments go live.
 */
export const FREE_LAUNCH = true;
export function effectivePlan(plan: PlanId): PlanId {
	return FREE_LAUNCH && plan === 'free' ? 'pro' : plan;
}
