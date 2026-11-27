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
			sb.auth.onAuthStateChange((_event, session) => this.setSession(session?.user ?? null));
		} catch (e) {
			this.error = e instanceof Error ? e.message : String(e);
			this.status = 'signed-out';
		}
	}

	private setSession(user: { email?: string; user_metadata?: Record<string, unknown> } | null) {
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
		this.status = 'signed-in';
	}

	async signInWithGoogle() {
		this.error = null;
		const sb = await getSupabase();
		const { error } = await sb.auth.signInWithOAuth({
			provider: 'google',
			options: { redirectTo: `${location.origin}/welcome` }
		});
		if (error) this.error = error.message;
	}

	async signOut() {
		if (supabaseConfigured) {
			const sb = await getSupabase();
			await sb.auth.signOut();
		}
		this.status = supabaseConfigured ? 'signed-out' : 'preview';
	}
}

export const auth = new Auth();
