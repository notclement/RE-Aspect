/**
 * Editable project details (name, unit number, address, type, description, notes).
 * Kept in this browser for speed and synced to the Supabase `projects` table when signed in,
 * so they follow the user across devices and show up in the admin panel.
 */
import { DAKOTA_UNIT, LOFT_UNIT, HDB_UNIT, SAMPLE_UNITS } from '#lib/sample-unit.ts';
import { isPropertyType, type PropertyType } from '#lib/config/property-types.ts';
import { getSupabase } from '#lib/supabase.ts';
import { sanitizePlan, type PlanData } from '#lib/plan.ts';

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
	const mine = getProject(id);
	if (mine) return { name: mine.name, unitNo: mine.unitNo, address: mine.address, propertyType: mine.propertyType, description: mine.description, notes: mine.notes };
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
	if (getProject(id)) return updateProject(id, details);
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
		const { data, error } = await sb.from('projects').select(COLS);
		if (error) throw error;
		const have = new Set<string>();
		const mine: MyProject[] = [];
		for (const r of (data ?? []) as (Row & CloudRow)[]) {
			if (!r.demo_key) {
				mine.push(fromCloud(r));
				continue;
			}
			if (!DEFAULTS[r.demo_key]) continue;
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
		// Keep local edits that haven't reached the server yet (newer updatedAt wins).
		const local = new Map(myProjects.map((p) => [p.id, p]));
		myProjects.splice(0, myProjects.length, ...mine.map((p) => {
			const l = local.get(p.id);
			return l && l.updatedAt > p.updatedAt ? l : p;
		}).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
		cacheMine();
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
	myProjects.splice(0, myProjects.length);
	cacheMine();
}

// ─── The user's own projects (Phase 1) ──────────────────────────────────────────────────────
export type ProjectStatus = 'draft' | 'processing' | 'ready' | 'failed';
export interface MyProject extends ProjectDetails {
	id: string;
	level: number | null;
	sizeSqft: number | null;
	ceilingCm: number;
	lat: number | null;
	lon: number | null;
	status: ProjectStatus;
	plan: PlanData | null;
	updatedAt: string;
}
interface CloudRow {
	id: string;
	level: number | null;
	size_sqft: number | null;
	ceiling_cm: number;
	lat: number | null;
	lon: number | null;
	status: string;
	plan: unknown;
	updated_at: string;
}
const COLS = 'id, demo_key, name, unit_no, address, property_type, description, notes, level, size_sqft, ceiling_cm, lat, lon, status, plan, updated_at';
const MINE_KEY = 'rea.myprojects.v1';

const STATUSES: ProjectStatus[] = ['draft', 'processing', 'ready', 'failed'];
function fromCloud(r: Row & CloudRow): MyProject {
	return {
		id: r.id,
		name: r.name,
		unitNo: r.unit_no,
		address: r.address,
		propertyType: isPropertyType(r.property_type) ? r.property_type : 'other',
		description: r.description,
		notes: r.notes,
		level: r.level,
		sizeSqft: r.size_sqft,
		ceilingCm: r.ceiling_cm || 260,
		lat: r.lat,
		lon: r.lon,
		status: STATUSES.includes(r.status as ProjectStatus) ? (r.status as ProjectStatus) : 'draft',
		plan: sanitizePlan(r.plan),
		updatedAt: r.updated_at
	};
}
function toCloud(p: Partial<MyProject>) {
	const o: Record<string, unknown> = {};
	if (p.name !== undefined) o.name = p.name;
	if (p.unitNo !== undefined) o.unit_no = p.unitNo;
	if (p.address !== undefined) o.address = p.address;
	if (p.propertyType !== undefined) o.property_type = p.propertyType;
	if (p.description !== undefined) o.description = p.description;
	if (p.notes !== undefined) o.notes = p.notes;
	if (p.level !== undefined) o.level = p.level;
	if (p.sizeSqft !== undefined) o.size_sqft = p.sizeSqft;
	if (p.ceilingCm !== undefined) o.ceiling_cm = p.ceilingCm;
	if (p.lat !== undefined) o.lat = p.lat;
	if (p.lon !== undefined) o.lon = p.lon;
	if (p.status !== undefined) o.status = p.status;
	if (p.plan !== undefined) o.plan = p.plan;
	return o;
}

function loadMine(): MyProject[] {
	try {
		const raw = JSON.parse(localStorage.getItem(MINE_KEY) ?? '[]');
		return Array.isArray(raw) ? raw.map((p) => ({ ...p, plan: sanitizePlan(p.plan) })) : [];
	} catch {
		return [];
	}
}
export const myProjects = $state<MyProject[]>(typeof localStorage === 'undefined' ? [] : loadMine());
function cacheMine() {
	try {
		localStorage.setItem(MINE_KEY, JSON.stringify(myProjects));
	} catch {
		/* storage full / private mode — the cloud copy is the source of truth */
	}
}

export function getProject(id: string | null | undefined): MyProject | undefined {
	return id ? myProjects.find((p) => p.id === id) : undefined;
}

/** Create a project (server first when signed in, so the plan limit is enforced there). */
export async function createProject(fields: Omit<MyProject, 'id' | 'updatedAt' | 'plan' | 'status'>): Promise<MyProject> {
	const now = new Date().toISOString();
	let p: MyProject;
	if (signedIn) {
		const sb = await getSupabase();
		const { data, error } = await sb
			.from('projects')
			.insert({ ...toCloud(fields), status: 'draft' })
			.select(COLS)
			.single();
		if (error) throw new Error(error.message.includes('limit') ? error.message : 'Could not create the project. Please try again.');
		p = fromCloud(data as Row & CloudRow);
	} else {
		p = { ...fields, id: crypto.randomUUID(), status: 'draft', plan: null, updatedAt: now };
	}
	myProjects.unshift(p);
	cacheMine();
	return p;
}

const pending = new Map<string, { patch: Record<string, unknown>; timer: ReturnType<typeof setTimeout> }>();
/** Update locally at once; push to the server (debounced for plan edits from Studio). */
export function updateProject(id: string, patch: Partial<MyProject>, delay = 0) {
	const i = myProjects.findIndex((p) => p.id === id);
	if (i < 0) return;
	myProjects[i] = { ...myProjects[i], ...patch, updatedAt: new Date().toISOString() };
	cacheMine();
	if (!signedIn) return;
	const prev = pending.get(id);
	if (prev) clearTimeout(prev.timer);
	const merged = { ...(prev?.patch ?? {}), ...toCloud(patch) };
	const timer = setTimeout(() => void flush(id), delay);
	pending.set(id, { patch: merged, timer });
}
export async function flush(id: string) {
	const job = pending.get(id);
	if (!job) return;
	clearTimeout(job.timer);
	pending.delete(id);
	try {
		const sb = await getSupabase();
		const { error } = await sb.from('projects').update(job.patch).eq('id', id);
		if (error) throw error;
	} catch (e) {
		console.warn('[projects] could not save', e);
	}
}
if (typeof window !== 'undefined') {
	addEventListener('pagehide', () => pending.forEach((_, id) => void flush(id)));
}

export async function deleteProject(id: string) {
	const i = myProjects.findIndex((p) => p.id === id);
	if (i >= 0) myProjects.splice(i, 1);
	cacheMine();
	if (!signedIn) return;
	const sb = await getSupabase();
	const { error } = await sb.from('projects').delete().eq('id', id);
	if (error) throw new Error('Could not delete the project.');
}
