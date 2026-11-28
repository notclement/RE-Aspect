/**
 * Stripe payments (edge function stripe-checkout, migration 0019). The browser only asks for a Checkout / portal
 * page and goes there; the plan changes on the server when Stripe's webhook confirms the payment.
 */
import { getSupabase, supabaseConfigured } from '#lib/supabase.ts';
import { fnError } from '#lib/fn-error.ts';

const STRIPE_URL = /^https:\/\/(checkout|billing)\.stripe\.com\//;

class Billing {
	/** null = not checked yet; false = payments not switched on (Upgrade shows "Coming soon"). */
	on = $state<boolean | null>(null);
	test = $state(false);
	projects = $state(false);

	async probe() {
		if (this.on !== null) return;
		if (!supabaseConfigured) return void (this.on = false);
		try {
			const sb = await getSupabase();
			const { data, error } = await sb.functions.invoke('stripe-checkout', { body: { kind: 'probe' } });
			const d = (data ?? {}) as Record<string, unknown>;
			this.on = !error && d.status === 'on';
			this.test = d.test === true;
			this.projects = d.projects === true;
		} catch {
			this.on = false;
		}
	}

	/** Go to Stripe: Pro subscription, extra projects (Pro only) or the billing portal. Throws a readable message. */
	async go(kind: 'pro' | 'project' | 'portal', quantity = 1): Promise<void> {
		const sb = await getSupabase();
		const { data, error } = await sb.functions.invoke('stripe-checkout', { body: { kind, quantity } });
		if (error) throw new Error(await fnError(error));
		const url = (data as Record<string, unknown> | null)?.url;
		if ((data as Record<string, unknown> | null)?.status === 'off') throw new Error('Payments aren’t switched on yet.');
		if (typeof url !== 'string' || !STRIPE_URL.test(url)) throw new Error('Could not open the payment page.');
		location.assign(url);
	}
}

export const billing = new Billing();
