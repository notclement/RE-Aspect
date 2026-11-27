/**
 * The signed-in user's agency (Lead or member). Server functions in migration 0008 do every check;
 * this store only mirrors what agency_mine() returns, validated.
 */
import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';

export interface AgencyMember {
	id: string;
	name: string;
	avatar: string | null;
	role: 'lead' | 'member';
	status: 'pending' | 'active';
	joinedAt: string;
	projects: number;
	projectList: { id: string; name: string; unitNo: string; updatedAt: string }[] | null; // lead only
}
export interface AgencyInfo {
	id: string;
	name: string;
	role: 'lead' | 'member';
	status: 'pending' | 'active';
	lead?: string; // lead's name (pending view)
	seats: number;
	memberLimit: number;
	pool: number;
	used: number;
	inviteCode: string | null; // lead only
	members: AgencyMember[];
}

const str = (v: unknown, max = 80) => (typeof v === 'string' ? v.replace(/[<>{}\\\u0000-\u001f]/g, '').slice(0, max) : '');
const int = (v: unknown) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : 0);
const AVATAR = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/;
const CODE = /^[A-HJ-NP-Z2-9]{8}$/;

export function sanitizeAgency(raw: unknown): AgencyInfo | null {
	if (!raw || typeof raw !== 'object') return null;
	const r = raw as Record<string, unknown>;
	const id = str(r.id, 40);
	if (!id) return null;
	const members = (Array.isArray(r.members) ? r.members : []).slice(0, 600).map((m): AgencyMember => {
		const o = (m ?? {}) as Record<string, unknown>;
		return {
			id: str(o.id, 40),
			name: str(o.name, 40) || '(no name)',
			avatar: typeof o.avatar === 'string' && o.avatar.length <= 16000 && AVATAR.test(o.avatar) ? o.avatar : null,
			role: o.role === 'lead' ? 'lead' : 'member',
			status: o.status === 'active' ? 'active' : 'pending',
			joinedAt: str(o.joinedAt, 40),
			projects: int(o.projects),
			projectList: Array.isArray(o.projectList)
				? o.projectList.slice(0, 500).map((p) => {
						const q = (p ?? {}) as Record<string, unknown>;
						return { id: str(q.id, 40), name: str(q.name, 60), unitNo: str(q.unitNo, 12), updatedAt: str(q.updatedAt, 40) };
					})
				: null
		};
	});
	return {
		id,
		name: str(r.name, 60),
		role: r.role === 'lead' ? 'lead' : 'member',
		status: r.status === 'active' ? 'active' : 'pending',
		lead: str(r.lead, 40) || undefined,
		seats: int(r.seats),
		memberLimit: int(r.memberLimit),
		pool: int(r.pool),
		used: int(r.used),
		inviteCode: typeof r.inviteCode === 'string' && CODE.test(r.inviteCode) ? r.inviteCode : null,
		members
	};
}

/** Friendly message from a Supabase/Postgres error. */
export function errText(e: unknown): string {
	const m = e && typeof e === 'object' && 'message' in e ? String((e as { message: unknown }).message) : '';
	return m && m.length < 200 ? m : 'Something went wrong — please try again.';
}

const JOIN_KEY = 'rea.joinCode';
/** Invite code waiting for sign-in (from a scanned QR link). */
export const pendingJoin = {
	get(): string | null {
		try {
			return localStorage.getItem(JOIN_KEY);
		} catch {
			return null;
		}
	},
	set(code: string | null) {
		try {
			if (code) localStorage.setItem(JOIN_KEY, code);
			else localStorage.removeItem(JOIN_KEY);
		} catch {
			/* ignore */
		}
	}
};

class AgencyStore {
	info = $state<AgencyInfo | null>(null);
	loaded = $state(false);

	get active() {
		return this.info?.status === 'active';
	}
	get isLead() {
		return this.active && this.info?.role === 'lead';
	}

	clear() {
		this.info = null;
		this.loaded = false;
	}

	async refresh() {
		if (!supabaseConfigured) {
			this.loaded = true;
			return;
		}
		try {
			const sb = await getSupabase();
			const { data, error } = await sb.rpc('agency_mine');
			if (error) throw error;
			this.info = sanitizeAgency(data);
		} catch (e) {
			console.warn('[agency] could not load', e);
		}
		this.loaded = true;
	}

	private async call(fn: string, args?: Record<string, unknown>) {
		const sb = await getSupabase();
		const { data, error } = await sb.rpc(fn, args);
		if (error) throw new Error(errText(error));
		return data;
	}
	async approve(user: string) {
		await this.call('agency_member', { p_user: user, p_action: 'approve' });
		await this.refresh();
	}
	async remove(user: string) {
		await this.call('agency_member', { p_user: user, p_action: 'remove' });
		await this.refresh();
	}
	async resetCode() {
		await this.call('agency_reset_code');
		await this.refresh();
	}
	async rename(name: string) {
		await this.call('agency_rename', { p_name: name });
		await this.refresh();
	}
	async leave() {
		await this.call('agency_leave');
		await this.refresh();
	}
	async peek(code: string): Promise<{ id: string; name: string; lead: string } | null> {
		const d = (await this.call('agency_peek', { p_code: code })) as Record<string, unknown> | null;
		return d ? { id: str(d.id, 40), name: str(d.name, 60), lead: str(d.lead, 40) } : null;
	}
	async join(code: string): Promise<'pending' | 'active'> {
		const d = (await this.call('agency_join', { p_code: code })) as Record<string, unknown> | null;
		await this.refresh();
		return d?.status === 'active' ? 'active' : 'pending';
	}
	async enquire(f: { company: string; teamSize: number; phone: string; message: string }) {
		await this.call('agency_enquire', { p_company: f.company, p_team_size: f.teamSize, p_phone: f.phone, p_message: f.message });
	}
}

export const agency = new AgencyStore();
