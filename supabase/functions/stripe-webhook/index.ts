// RE:Aspect · stripe-webhook
// Called by Stripe only. Verifies the Stripe signature, records each event once, then:
//   checkout.session.completed (subscription) → Pro until the end of the first period
//   checkout.session.completed (payment, kind=project) → +N extra projects
//   invoice.paid (renewal) → Pro until the end of the new period
//   customer.subscription.deleted → nothing to undo: Pro simply runs out at the end of the paid period (+3 days)
// Secrets: STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET (whsec_…).
// Deploy: Supabase → Edge Functions → stripe-webhook (Verify JWT OFF — Stripe has no Supabase token).
// In Stripe → Developers → Webhooks, point an endpoint at …/functions/v1/stripe-webhook with these 3 events.
import { createClient } from 'jsr:@supabase/supabase-js@2';

function firstKey(name: string): string {
	try {
		const v = JSON.parse(Deno.env.get(name) ?? '{}');
		return (Object.values(v)[0] as string) ?? '';
	} catch {
		return '';
	}
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');

/** Stripe-Signature check: HMAC-SHA256 of "<t>.<payload>", within 5 minutes, constant-time compare. */
async function verify(payload: string, header: string, secret: string): Promise<boolean> {
	const parts = Object.fromEntries(header.split(',').map((p) => p.split('=', 2) as [string, string]));
	const t = Number(parts.t);
	const sigs = header.split(',').filter((p) => p.startsWith('v1=')).map((p) => p.slice(3));
	if (!Number.isFinite(t) || !sigs.length || Math.abs(Date.now() / 1000 - t) > 300) return false;
	const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
	const want = hex(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(`${t}.${payload}`)));
	return sigs.some((s) => s.length === want.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ want.charCodeAt(i)), 0) === 0);
}

async function stripeGet(key: string, path: string): Promise<Record<string, unknown>> {
	const r = await fetch(`https://api.stripe.com/v1/${path}`, { headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(15_000) });
	if (!r.ok) throw new Error(`Stripe answered ${r.status}`);
	return await r.json();
}

Deno.serve(async (req) => {
	if (req.method !== 'POST') return new Response('POST only', { status: 405 });
	const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
	const key = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
	if (!secret.startsWith('whsec_') || !key) return new Response('not configured', { status: 503 });
	const payload = await req.text();
	if (payload.length > 200_000 || !(await verify(payload, req.headers.get('stripe-signature') ?? '', secret))) return new Response('bad signature', { status: 400 });

	// deno-lint-ignore no-explicit-any
	const ev: any = JSON.parse(payload);
	const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? firstKey('SUPABASE_SECRET_KEYS');
	const admin = createClient(Deno.env.get('SUPABASE_URL')!, service);
	const o = ev?.data?.object ?? {};
	try {
		if (ev.type === 'checkout.session.completed' && o.payment_status === 'paid') {
			const user = String(o.metadata?.user_id ?? o.client_reference_id ?? '');
			if (!UUID.test(user)) return new Response('no user', { status: 200 });
			const kind = o.metadata?.kind === 'project' ? 'project' : 'pro';
			const { data: fresh } = await admin.rpc('stripe_record', { p_event: ev.id, p_user: user, p_kind: kind, p_amount: o.amount_total ?? null, p_currency: o.currency ?? 'sgd' });
			if (!fresh) return new Response('already handled', { status: 200 });
			if (kind === 'project') {
				const items = await stripeGet(key, `checkout/sessions/${o.id}/line_items`);
				// deno-lint-ignore no-explicit-any
				const n = ((items.data as any[]) ?? []).reduce((t, li) => t + (Number(li.quantity) || 0), 0);
				await admin.rpc('stripe_add_projects', { p_user: user, p_n: n });
			} else if (o.subscription) {
				const sub = await stripeGet(key, `subscriptions/${o.subscription}`);
				const end = Number(sub.current_period_end ?? (sub.items as { data?: { current_period_end?: number }[] })?.data?.[0]?.current_period_end);
				await admin.rpc('stripe_set_pro', { p_user: user, p_customer: String(o.customer ?? ''), p_until: new Date((Number.isFinite(end) ? end : Date.now() / 1000 + 31 * 86400) * 1000).toISOString() });
			}
		} else if (ev.type === 'invoice.paid' && o.billing_reason === 'subscription_cycle') {
			const { data: prof } = await admin.from('profiles').select('id').eq('stripe_customer', String(o.customer ?? '')).maybeSingle();
			if (!prof) return new Response('unknown customer', { status: 200 });
			const { data: fresh } = await admin.rpc('stripe_record', { p_event: ev.id, p_user: prof.id, p_kind: 'renewal', p_amount: o.amount_paid ?? null, p_currency: o.currency ?? 'sgd' });
			if (!fresh) return new Response('already handled', { status: 200 });
			const end = Number(o.lines?.data?.[0]?.period?.end);
			if (Number.isFinite(end)) await admin.rpc('stripe_set_pro', { p_user: prof.id, p_customer: null, p_until: new Date(end * 1000).toISOString() });
		} else if (ev.type === 'customer.subscription.deleted') {
			const { data: prof } = await admin.from('profiles').select('id').eq('stripe_customer', String(o.customer ?? '')).maybeSingle();
			await admin.rpc('stripe_record', { p_event: ev.id, p_user: prof?.id ?? null, p_kind: 'cancel', p_amount: null, p_currency: 'sgd' });
		}
		return new Response('ok', { status: 200 });
	} catch (e) {
		console.warn('[stripe-webhook]', ev?.type, e instanceof Error ? e.message : e);
		// Forget the event so Stripe's retry runs it again (it was recorded before the step that failed).
		await admin.from('payments').delete().eq('event_id', String(ev?.id ?? '')).then(() => {}, () => {});
		return new Response('error', { status: 500 }); // Stripe retries
	}
});
