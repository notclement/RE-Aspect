/**
 * Editable project details (name, unit number, address, description, notes).
 * Phase 0/1: kept in this browser per project; Phase 1 moves them to the Supabase `projects` table.
 */
import { SAMPLE_UNIT, LOFT_UNIT, HDB_UNIT } from '#lib/sample-unit.ts';

export interface ProjectDetails {
	name: string;
	unitNo: string;
	address: string;
	description: string;
	notes: string;
}

const KEY = 'rea.projects';

function load(): Record<string, Partial<ProjectDetails>> {
	try {
		return JSON.parse(localStorage.getItem(KEY) ?? '{}');
	} catch {
		return {};
	}
}

const overrides = $state<Record<string, Partial<ProjectDetails>>>(typeof localStorage === 'undefined' ? {} : load());

const DEFAULTS: Record<string, ProjectDetails> = {
	[SAMPLE_UNIT.id]: {
		name: SAMPLE_UNIT.name,
		unitNo: SAMPLE_UNIT.unitNo,
		address: 'Singapore',
		description: 'Demo 3-room unit for trying out DayTrace.',
		notes: ''
	},
	[LOFT_UNIT.id]: {
		name: LOFT_UNIT.name,
		unitNo: LOFT_UNIT.unitNo,
		address: 'Tanjong Pagar, Singapore',
		description: 'West-facing studio loft — strong late-afternoon sun.',
		notes: ''
	},
	[HDB_UNIT.id]: {
		name: HDB_UNIT.name,
		unitNo: HDB_UNIT.unitNo,
		address: 'Tampines, Singapore',
		description: 'North–south HDB 4-room, turned 20° — gentle light, bedrooms on the north.',
		notes: ''
	}
};

export function projectDetails(id: string): ProjectDetails {
	const base = DEFAULTS[id] ?? { name: 'Untitled project', unitNo: '', address: '', description: '', notes: '' };
	return { ...base, ...overrides[id] };
}

export function saveProjectDetails(id: string, details: ProjectDetails) {
	overrides[id] = details;
	try {
		localStorage.setItem(KEY, JSON.stringify(overrides));
	} catch {
		/* ignore */
	}
}
