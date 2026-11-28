import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
import { profile, sanitizeSettings } from './profile.svelte';
import { theme } from './theme.svelte.ts';
import { syncProjects, signOutProjects } from './projects.svelte.ts';
import { isAvatarDataUrl } from '#lib/image.ts';
import { agency } from './agency.svelte.ts';
import { promo } from './promo.svelte.ts';

export type AuthStatus = 'loading' | 'signed-in' | 'signed-out' | 'preview';

class Auth {
	status = $state<AuthStatus>('loading');
	email = $state<string | null>(null);
	error = $state<string | null>(null);

	async init() {
		// Any settings change (incl. theme) is saved to the account, debounced.
		profile.onSettingsChange = theme.onChange = () => this.queueSettingsSave();
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
			agency.clear();
			promo.clear();
			return;
		}
		this.email = user.email ?? null;
		// Pre-fill the name from Google if the user hasn't chosen one yet (they can change it on /welcome).
		const googleName = user.user_metadata?.full_name;
		if (!profile.data.name && typeof googleName === 'string') {
			profile.update({ name: googleName.slice(0, 40) });
		}
		await Promise.all([this.loadProfile(), agency.refresh(), promo.refresh()]);
		this.status = 'signed-in';
		void syncProjects();
	}

	/** Pull name + plan from the `profiles` table (server is the source of truth for the plan). */
	/** Re-read the profile row (plan, Pro end date) from the server. */
	async loadProfile() {
		if (!this.userId) return;
		try {
			const sb = await getSupabase();
			const { data, error } = await sb
				.from('profiles')
				.select('*') // * so a column added by a newer migration (e.g. extra_projects) never breaks sign-in
				.eq('id', this.userId)
				.maybeSingle();
			if (error) throw error;
			if (data) {
				// Granted Pro ends at pro_until (null = no end date; 'infinity' = lifetime).
				const until: string | null = typeof data.pro_until === 'string' ? data.pro_until : null;
				const expired = until !== null && until !== 'infinity' && new Date(until).getTime() < Date.now();
				const plan = data.plan === 'agency' ? 'agency' : data.plan === 'pro' && !expired ? 'pro' : 'free';
				profile.update({
					plan,
					proUntil: plan === 'pro' ? until : null,
					isAdmin: data.is_admin === true,
					avatar: isAvatarDataUrl(data.avatar) ? data.avatar : null,
					disabled: data.disabled === true,
					extraProjects: Number.isInteger(data.extra_projects) ? Math.max(0, Math.min(1000, data.extra_projects)) : 0,
					...(data.name ? { name: data.name } : {})
				});
				if (!data.is_admin) profile.setViewAs(null);
				// Settings follow the account: use the saved ones; first time on this account, upload this device's.
				const saved = sanitizeSettings(data.settings);
				if (Object.keys(saved).length) profile.applySettings(saved);
				else this.queueSettingsSave(0);
			}
		} catch (e) {
			console.warn('[auth] could not load profile', e);
		}
	}

	private saveTimer: ReturnType<typeof setTimeout> | undefined;
	/** Save the current settings to the account shortly after the last change. */
	queueSettingsSave(delay = 800) {
		if (!this.userId) return;
		clearTimeout(this.saveTimer);
		this.saveTimer = setTimeout(() => void this.saveSettings(), delay);
	}
	private async saveSettings() {
		if (!this.userId) return;
		try {
			const sb = await getSupabase();
			const { error } = await sb.from('profiles').update({ settings: profile.settings }).eq('id', this.userId);
			if (error) throw error;
		} catch (e) {
			console.warn('[auth] could not save settings', e);
		}
	}

	/** Save (or with null, remove) the profile photo — already shrunk by makeAvatar(). */
	async saveAvatar(avatar: string | null) {
		if (avatar !== null && !isAvatarDataUrl(avatar)) throw new Error('Invalid image.');
		profile.update({ avatar });
		if (this.status !== 'signed-in' || !this.userId) return;
		const sb = await getSupabase();
		const { error } = await sb.from('profiles').update({ avatar }).eq('id', this.userId);
		if (error) throw new Error(error.message);
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
			profile.update({ name: '', plan: 'free', proUntil: null, isAdmin: false, avatar: null, disabled: false });
			signOutProjects();
			agency.clear();
		}
		this.status = supabaseConfigured ? 'signed-out' : 'preview';
	}
}

export const auth = new Auth();
