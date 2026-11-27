/**
 * Editable project details (name, unit number, address, type, description, notes).
 * Kept in this browser for speed and synced to the Supabase `projects` table when signed in,
 * so they follow the user across devices and show up in the admin panel.
 */
import { DAKOTA_UNIT, LOFT_UNIT, HDB_UNIT, SAMPLE_UNITS } from '#lib/sample-unit.ts';
import { isPropertyType, type PropertyType } from '#lib/config/property-types.ts';
import { getSupabase } from '#lib/supabase.ts';

export interface ProjectDetails {
	name: string;
	unitNo: string;
	address: string;
	propertyType: PropertyType;
	description: string;
	notes: string;
}

const KEY = 'rea.projects.v2'; // v2: demo 1 became Dakota One

function load(): Record<string, Partial<ProjectDetails>> {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? '{}');
	} catch {
		return {};
	}
}

const overrides = $state<Record<string, Partial<ProjectDetails>>>(typeof localStorage === 'undefined' ? {} : load());

const DEFAULTS: Record<string, ProjectDetails> = {
	[DAKOTA_UNIT.id]: {
		name: DAKOTA_UNIT.name,
		unitNo: DAKOTA_UNIT.unitNo,
		address: 'Blk 88B Jalan Satu, Singapore 392088',
		propertyType: 'hdb',
		description: 'HDB 3-room Type-2B (68 m²) next to Dakota MRT — bedrooms and living room face the same side.',
		notes: ''
	},
	[LOFT_UNIT.id]: {
		name: LOFT_UNIT.name,
		unitNo: LOFT_UNIT.unitNo,
		address: 'Tanjong Pagar, Singapore',
		propertyType: 'condo',
		description: 'West-facing studio loft — strong late-afternoon sun.',
		notes: ''
	},
	[HDB_UNIT.id]: {
		name: HDB_UNIT.name,
		unitNo: HDB_UNIT.unitNo,
		address: 'Tampines, Singapore',
		propertyType: 'hdb',
		description: 'North–south HDB 4-room, turned 20° — gentle light, bedrooms on the north.',
		notes: ''
	}
};

export function projectDetails(id: string): ProjectDetails {
	const base = DEFAULTS[id] ?? { name: 'Untitled project', unitNo: '', address: '', propertyType: 'other', description: '', notes: '' };
	const merged = { ...base, ...overrides[id] };
	if (!isPropertyType(merged.propertyType)) merged.propertyType = base.propertyType;
	return merged;
}

function persist() {
	try {
		localStorage.setItem(KEY, JSON.stringify(overrides));
	} catch {
		/* ignore */
	}
}

type Row = { demo_key: string | null; name: string; unit_no: string; address: string; property_type: string; description: string; notes: string };
const toRow = (key: string, d: ProjectDetails): Row => ({
	demo_key: key,
	name: d.name,
	unit_no: d.unitNo,
	address: d.address,
	property_type: d.propertyType,
	description: d.description,
	notes: d.notes
});

let signedIn = false;

export async function saveProjectDetails(id: string, details: ProjectDetails) {
	overrides[id] = details;
	persist();
	if (!signedIn) return;
	try {
		const sb = await getSupabase();
		const { error } = await sb.from('projects').upsert(toRow(id, details), { onConflict: 'owner,demo_key' });
		if (error) throw error;
	} catch (e) {
		console.warn('[projects] could not save to the cloud', e);
	}
}

/** On sign-in: pull this user's saved project details, and make sure their demo projects exist on the server. */
export async function syncProjects() {
	signedIn = true;
	try {
		const sb = await getSupabase();
		const { data, error } = await sb.from('projects').select('demo_key, name, unit_no, address, property_type, description, notes');
		if (error) throw error;
		const have = new Set<string>();
		for (const r of (data ?? []) as Row[]) {
			if (!r.demo_key || !DEFAULTS[r.demo_key]) continue;
			have.add(r.demo_key);
			overrides[r.demo_key] = {
				name: r.name,
				unitNo: r.unit_no,
				address: r.address,
				propertyType: isPropertyType(r.property_type) ? r.property_type : DEFAULTS[r.demo_key].propertyType,
				description: r.description,
				notes: r.notes
			};
		}
		persist();
		const missing = SAMPLE_UNITS.filter((u) => !have.has(u.id)).map((u) => toRow(u.id, projectDetails(u.id)));
		if (missing.length) {
			const { error: e2 } = await sb.from('projects').upsert(missing, { onConflict: 'owner,demo_key', ignoreDuplicates: true });
			if (e2) throw e2;
		}
	} catch (e) {
		console.warn('[projects] could not sync', e);
	}
}

export function signOutProjects() {
	signedIn = false;
	for (const k of Object.keys(overrides)) delete overrides[k];
	persist();
}
