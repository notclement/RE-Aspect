<script lang="ts">
	import { nav } from '#lib/stores/nav.svelte.ts';
	$effect(() => nav.set({ label: 'Settings' }));
	import Icon, { type IconName } from '#lib/components/Icon.svelte';
	import InstallCard from '#lib/components/InstallCard.svelte';
	import { theme, type ThemeChoice } from '#lib/stores/theme.svelte.ts';
	import { profile, ROLE_LABELS, type RoleView } from '#lib/stores/profile.svelte.ts';
	import { auth } from '#lib/stores/auth.svelte.ts';
	import { BRAND } from '#lib/config/brand.ts';
	import { validateBodyHeightCm } from '#lib/validate.ts';

	const themes: { id: ThemeChoice; label: string; icon: IconName }[] = [
		{ id: 'light', label: 'Light', icon: 'sun' },
		{ id: 'dark', label: 'Dark', icon: 'moon' },
		{ id: 'system', label: 'System', icon: 'monitor' }
	];

	const roles = Object.entries(ROLE_LABELS) as [RoleView, string][];

	let height = $state(String(profile.data.bodyHeightCm));
	let heightError = $state<string | null>(null);
	function saveHeight() {
		const r = validateBodyHeightCm(height);
		heightError = r.ok ? null : r.error;
		if (r.ok) profile.update({ bodyHeightCm: r.value });
	}
</script>

<svelte:head><title>Settings · RE:Aspect</title></svelte:head>

<h1>Settings</h1>

<a class="card row profile" href="/profile">
	<span class="avatar">{profile.firstName.slice(0, 1).toUpperCase() || '?'}</span>
	<span class="grow"><strong>{profile.data.name}</strong><br /><span class="muted">{auth.email ?? 'Preview mode'}</span></span>
	<Icon name="chevron" />
</a>

{#if profile.data.isAdmin}
	<h3>Admin</h3>
	<div class="card admin">
		<p class="role"><Icon name="shield" size={18} /> You're an <strong>Admin</strong></p>
		<label class="muted small" for="viewas">View the app as</label>
		<div class="roles" id="viewas" role="radiogroup" aria-label="View the app as">
			{#each roles as [id, label] (id)}
				<button
					role="radio"
					aria-checked={profile.role === id}
					class:on={profile.role === id}
					onclick={() => profile.setViewAs(id === 'admin' ? null : id)}>{label}</button
				>
			{/each}
		</div>
		<p class="muted note">Preview only — changes what you see (limits, menus, badges). Your real admin access stays on, and the server still enforces every permission.</p>
	</div>
{/if}

<h3>Appearance</h3>
<div class="seg" role="radiogroup" aria-label="Theme">
	{#each themes as t (t.id)}
		<button role="radio" aria-checked={theme.choice === t.id} class:on={theme.choice === t.id} onclick={() => theme.set(t.id)}>
			<Icon name={t.icon} size={18} />{t.label}
		</button>
	{/each}
</div>
<p class="muted note">Remembered on this browser.</p>

<h3>Sun view</h3>
<div class="card list">
	<label class="li toggle">
		<span>Show the sun's position<br /><span class="muted note">A sun marker in the sky above the plan</span></span>
		<input
			type="checkbox"
			checked={profile.data.showSunMarker}
			onchange={(e) => profile.update({ showSunMarker: e.currentTarget.checked })}
		/>
	</label>
</div>

<h3>Units &amp; time</h3>
<div class="card list">
	<div class="li">
		<span>Area</span>
		<div class="seg sm">
			<button class:on={profile.data.areaUnit === 'sqft'} onclick={() => profile.update({ areaUnit: 'sqft' })}>sq ft</button>
			<button class:on={profile.data.areaUnit === 'sqm'} onclick={() => profile.update({ areaUnit: 'sqm' })}>m²</button>
		</div>
	</div>
	<div class="li">
		<span>Clock</span>
		<div class="seg sm">
			<button class:on={profile.data.clock === '12h'} onclick={() => profile.update({ clock: '12h' })}>12 h</button>
			<button class:on={profile.data.clock === '24h'} onclick={() => profile.update({ clock: '24h' })}>24 h</button>
		</div>
	</div>
</div>

<h3>3D walkthrough</h3>
<div class="card">
	<div class="field">
		<label for="h">Your height (cm)</label>
		<input id="h" inputmode="numeric" bind:value={height} onchange={saveHeight} />
		{#if heightError}<span class="error">{heightError}</span>{:else}<span class="muted note">Your eye level in 3D will be about {profile.eyeLevelCm} cm.</span>{/if}
	</div>
	<div class="field">
		<label for="spd">Walk speed · {profile.data.walkSpeed.toFixed(1)} m/s</label>
		<input id="spd" type="range" min="0.5" max="3" step="0.1" value={profile.data.walkSpeed}
			oninput={(e) => profile.update({ walkSpeed: Number(e.currentTarget.value) })} />
	</div>
	<div class="field">
		<label for="sens">Look sensitivity · {profile.data.lookSensitivity.toFixed(1)}×</label>
		<input id="sens" type="range" min="0.3" max="3" step="0.1" value={profile.data.lookSensitivity}
			oninput={(e) => profile.update({ lookSensitivity: Number(e.currentTarget.value) })} />
	</div>
</div>

<h3>App</h3>
<InstallCard />

<h3>About</h3>
<div class="card">
	<p><strong>{BRAND.name}</strong> · featuring <strong>{BRAND.sunFeature}</strong></p>
	<p class="muted">Sun positions are calculated estimates for guidance only.</p>
	<a class="dev" href={BRAND.developer.linkedin} target="_blank" rel="noopener noreferrer">
		<Icon name="linkedin" /> Built by {BRAND.developer.name}
	</a>
</div>

<button class="btn wide signout" onclick={() => auth.signOut()}><Icon name="logout" /> Sign out</button>

<style>
	h3 {
		margin-top: 22px;
		font-size: 13px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--muted);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 12px;
		text-decoration: none;
	}
	.grow {
		flex: 1;
		line-height: 1.3;
	}
	.avatar {
		width: 44px;
		height: 44px;
		border-radius: 50%;
		background: var(--dusk);
		color: #fff;
		display: grid;
		place-items: center;
		font-weight: 700;
	}
	.seg {
		display: flex;
		background: var(--surface-2);
		border-radius: 12px;
		padding: 4px;
		gap: 4px;
	}
	.seg button {
		flex: 1;
		min-height: 40px;
		border: 0;
		border-radius: 9px;
		background: transparent;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 6px;
		font-weight: 600;
		cursor: pointer;
	}
	.seg button.on {
		background: var(--surface);
		box-shadow: var(--shadow);
	}
	.seg.sm button {
		min-height: 34px;
		padding: 0 12px;
		white-space: nowrap;
	}
	.note {
		font-size: 12px;
		margin: 6px 0 0;
	}
	.list {
		padding: 4px 16px;
	}
	.li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 10px 0;
		border-bottom: 1px solid var(--line);
	}
	.li:last-child {
		border-bottom: 0;
	}
	input[type='range'] {
		accent-color: var(--dusk);
		width: 100%;
	}
	.dev {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		font-weight: 600;
		color: var(--sky);
		text-decoration: none;
	}
	.admin .role {
		display: flex;
		align-items: center;
		gap: 8px;
		margin: 0 0 12px;
		color: var(--forest);
	}
	.small {
		font-size: 12px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.roles {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-top: 8px;
	}
	.roles button {
		min-height: 40px;
		padding: 0 14px;
		border-radius: 20px;
		border: 1px solid var(--line);
		background: var(--surface);
		font-weight: 600;
		cursor: pointer;
	}
	.roles button.on {
		background: var(--forest);
		border-color: var(--forest);
		color: #fff;
	}
	.toggle {
		gap: 12px;
		cursor: pointer;
	}
	.toggle input {
		appearance: none;
		width: 48px;
		height: 28px;
		border-radius: 14px;
		background: var(--surface-2);
		border: 1px solid var(--line);
		position: relative;
		flex-shrink: 0;
		cursor: pointer;
		transition: background 0.15s;
	}
	.toggle input::after {
		content: '';
		position: absolute;
		top: 2px;
		left: 2px;
		width: 22px;
		height: 22px;
		border-radius: 50%;
		background: #fff;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
		transition: transform 0.15s;
	}
	.toggle input:checked {
		background: var(--forest);
	}
	.toggle input:checked::after {
		transform: translateX(20px);
	}
	.signout {
		margin-top: 24px;
		color: var(--dusk);
	}
</style>
