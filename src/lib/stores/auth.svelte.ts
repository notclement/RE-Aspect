import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
import { profile } from './profile.svelte';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'preview';

class Auth {
	status = $state<AuthStatus>('loading');
	email = $state<string | null>(null);
	error = $state<string | null>(null);

	async init() {
		if (!supabaseConfigured) {
			this.status = 'preview';
			return;
		}
		try {
			const sb = await getSupabase();
			const { data } = await sb.auth.getSession();
			this.setSession(data.session?.user ?? null);
			sb.auth.onAuthStateChange((_event, session) => {
				// Defer: Supabase recommends not awaiting other calls inside this callback.
				setTimeout(() => this.setSession(session?.user ?? null), 0);
			});
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			this.status = 'signed-out';
		}
	}

	private userId: string | null = null;

	private async setSession(
		user: { id: string; email?: string; user_metadata?: Record<string, unknown> } | null
	) {
		this.userId = user?.id ?? null;
		if (!user) {
			this.status = 'signed-out';
			this.email = null;
			return;
		}
		this.email = user.email ?? null;
		// Pre-fill the name from Google if the user hasn't chosen one yet (they can change it on /welcome).
		const googleName = user.user_metadata?.full_name;
		if (!profile.data.name && typeof googleName === 'string') {
			profile.update({ name: googleName.slice(0, 40) });
		}
		await this.loadProfile();
		this.status = 'signed-in';
	}

	/** Pull name + plan from the `profiles` table (server is the source of truth for the plan). */
	private async loadProfile() {
		if (!this.userId) return;
		try {
			const sb = await getSupabase();
			const { data, error } = await sb
				.from('profiles')
				.select('name, plan, is_admin')
				.eq('id', this.userId)
				.maybeSingle();
			if (error) throw error;
			if (data) {
				const plan = data.plan === 'pro' || data.plan === 'agency' ? data.plan : 'free';
				profile.update({ plan, isAdmin: data.is_admin === true, ...(data.name ? { name: data.name } : {}) });
				if (!data.is_admin) profile.setViewAs(null);
			}
		} catch (e) {
			console.warn('[auth] could not load profile', e);
		}
	}

	/** Save an already-validated name locally and (when signed in) to the server. */
	async saveName(name: string) {
		profile.update({ name });
		if (this.status !== 'signed-in' || !this.userId) return;
		const sb = await getSupabase();
		const { error } = await sb.from('profiles').update({ name }).eq('id', this.userId);
		if (error) console.warn('[auth] could not save name', error.message);
	}

	async signInWithGoogle() {
		this.error = null;
		const sb = await getSupabase();
		const { error } = await sb.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${location.origin}/` }
		});
		if (error) this.error = error.message;
	}

	async signOut() {
		if (supabaseConfigured) {
			const sb = await getSupabase();
			await sb.auth.signOut();
		}
		if (supabaseConfigured) {
			// Forget this account's details in the browser so the next person to sign in doesn't inherit them.
			profile.setViewAs(null);
			profile.update({ name: '', plan: 'free', isAdmin: false });
		}
		this.status = supabaseConfigured ? 'signed-out' : 'preview';
	}
}

export const auth = new Auth();
