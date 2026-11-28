// RE:Aspect · stripe-checkout
// Signed-in users only. Opens a Stripe Checkout page (Pro S$50/month subscription, or extra projects at S$5 each,
// Pro only) or the Stripe billing portal (manage / cancel). Nothing about the plan changes here: only the
// stripe-webhook function upgrades the account, after Stripe confirms the payment.
// Secrets: STRIPE_SECRET_KEY (sk_test_… first), STRIPE_PRICE_PRO, STRIPE_PRICE_PROJECT. Without them it answers
// {status:'off'} and the Upgrade page shows "Coming soon".
// Deploy: Supabase → Edge Functions → stripe-checkout (Verify JWT off — it checks the user itself).
import { createClient } from 'jsr:@supabase/supabase-js@2';

const ALLOWED_ORIGINS = [
	'https://re-aspect.clement-392.workers.dev',
	'https://re-aspect-dev.clement-392.workers.dev',
	'http://localhost:5173',
	'http://localhost:4173'
];

function cors(req: Request) {
	const o = req.headers.get('origin') ?? '';
	return {
		'Access-Control-Allow-Origin': ALLOWED_ORIGINS.includes(o) ? o : ALLOWED_ORIGINS[0],
		'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
		'Access-Control-Allow-Methods': 'POST, OPTIONS',
		Vary: 'Origin'
	};
}
const json = (req: Request, body: unknown, status = 200) =>
	new Response(JSON.stringify(body), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } });
function firstKey(name: string): string {
	try {
		const v = JSON.parse(Deno.env.get(name) ?? '{}');
		return (Object.values(v)[0] as string) ?? '';
	} catch {
		return '';
	}
}

/** Stripe REST call (form-encoded). */
async function stripe(key: string, path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
	const r = await fetch(`https://api.stripe.com/v1/${path}`, {
		method: 'POST',
		signal: AbortSignal.timeout(15_000),
		headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams(params)
	});
	const out = await r.json();
	if (!r.ok) throw new Error(String(out?.error?.message ?? `Stripe answered ${r.status}`).slice(0, 200));
	return out;
}

Deno.serve(async (req) => {
	if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
	if (req.method !== 'POST') return json(req, { error: 'POST only' }, 405);
	const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
	const pricePro = Deno.env.get('STRIPE_PRICE_PRO') ?? '';
	const priceProject = Deno.env.get('STRIPE_PRICE_PROJECT') ?? '';
	if (!/^sk_(test|live)_/.test(key) || !/^price_/.test(pricePro)) return json(req, { status: 'off' });
	let body: Record<string, unknown> = {};
	try {
		body = await req.json();
	} catch {
		/* empty */
	}
	if (body.kind === 'probe') return json(req, { status: 'on', test: key.startsWith('sk_test_'), projects: /^price_/.test(priceProject) });

	const url = Deno.env.get('SUPABASE_URL')!;
	const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? firstKey('SUPABASE_PUBLISHABLE_KEYS');
	const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? firstKey('SUPABASE_SECRET_KEYS');
	if (!anon || !service) return json(req, { error: 'Server is not configured.' }, 500);
	const userClient = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
	const { data: u, error: ue } = await userClient.auth.getUser();
	if (ue || !u.user) return json(req, { error: 'Please sign in again.' }, 401);
	const user = u.user;

	const kind = body.kind === 'project' ? 'project' : body.kind === 'portal' ? 'portal' : 'pro';
	const qty = Math.max(1, Math.min(20, Math.round(Number(body.quantity) || 1)));
	const origin = ALLOWED_ORIGINS.includes(req.headers.get('origin') ?? '') ? req.headers.get('origin')! : ALLOWED_ORIGINS[0];

	const admin = createClient(url, service);
	const { data: prof } = await admin.from('profiles').select('stripe_customer, plan, pro_until').eq('id', user.id).single();
	const { data: eff } = await admin.rpc('effective_plan', { p_user: user.id });

	try {
		if (kind === 'portal') {
			if (!prof?.stripe_customer) return json(req, { error: 'No payments yet.' }, 400);
			const s = await stripe(key, 'billing_portal/sessions', { customer: prof.stripe_customer, return_url: `${origin}/upgrade` });
			return json(req, { url: s.url });
		}
		if (kind === 'project') {
			if (!/^price_/.test(priceProject)) return json(req, { status: 'off' });
			if (eff !== 'pro') return json(req, { error: 'Extra projects are for Pro.' }, 400);
		}
		// One Stripe customer per user, so renewals and the portal find the same person.
		let customer = prof?.stripe_customer as string | null;
		if (!customer) {
			const c = await stripe(key, 'customers', { email: user.email ?? '', 'metadata[user_id]': user.id });
			customer = String(c.id);
			await admin.from('profiles').update({ stripe_customer: customer }).eq('id', user.id);
		}
		const params: Record<string, string> = {
			customer,
			client_reference_id: user.id,
			'metadata[user_id]': user.id,
			'metadata[kind]': kind,
			success_url: `${origin}/upgrade?paid=${kind}`,
			cancel_url: `${origin}/upgrade`,
			'line_items[0][price]': kind === 'pro' ? pricePro : priceProject,
			'line_items[0][quantity]': String(kind === 'pro' ? 1 : qty),
			mode: kind === 'pro' ? 'subscription' : 'payment',
			allow_promotion_codes: 'true'
		};
		if (kind === 'pro') params['subscription_data[metadata][user_id]'] = user.id;
		else params['payment_intent_data[metadata][user_id]'] = user.id;
		const s = await stripe(key, 'checkout/sessions', params);
		return json(req, { url: s.url });
	} catch (e) {
		console.warn('[stripe-checkout]', e instanceof Error ? e.message : e);
		return json(req, { error: 'Payments are unavailable right now — please try again later.' }, 502);
	}
});
