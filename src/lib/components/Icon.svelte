<script lang="ts" module>
	const PATHS = {
		sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
		home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
		plan: '<rect x="3" y="3" width="18" height="18" rx="1"/><path d="M3 10h8v11M11 3v4M15 10h6"/>',
		cube: '<path d="M12 2l9 5v10l-9 5-9-5V7z"/><path d="M12 12l9-5M12 12v10M12 12L3 7"/>',
		walk: '<circle cx="13" cy="4" r="2"/><path d="M9 21l2-6 3 3v3M7 12l3-4 4 1 3 3M10 8l1 5"/>',
		gear: '<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
		user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4 4-6 8-6s7 2 8 6"/>',
		plus: '<path d="M12 5v14M5 12h14"/>',
		anchor: '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M5 13a7 7 0 0 0 14 0M8 10h8"/>',
		lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
		play: '<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
		pause: '<path d="M7 4h3v16H7zM14 4h3v16h-3z" fill="currentColor"/>',
		download: '<path d="M12 4v12M6 10l6 6 6-6M4 20h16"/>',
		share: '<path d="M12 3v13M7 8l5-5 5 5M5 14v6h14v-6"/>',
		moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
		monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
		logout: '<path d="M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10"/>',
		google: '<path d="M21 12.2c0-.7-.1-1.3-.2-1.9H12v3.6h5a4.3 4.3 0 0 1-1.9 2.8v2.3h3A9 9 0 0 0 21 12.2z"/><path d="M12 21a9 9 0 0 0 6.1-2.2l-3-2.3a5.6 5.6 0 0 1-8.3-2.9H3.7v2.4A9 9 0 0 0 12 21z"/><path d="M6.8 13.6a5.4 5.4 0 0 1 0-3.4V7.8H3.7a9 9 0 0 0 0 8.2z"/><path d="M12 6.6c1.4 0 2.6.5 3.6 1.4l2.7-2.7A9 9 0 0 0 3.7 7.8l3.1 2.4A5.4 5.4 0 0 1 12 6.6z"/>',
		linkedin: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M8 10v7M8 7v.01M12 17v-4a2 2 0 0 1 4 0v4M12 10v7"/>',
		menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
		clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
		grid: '<path d="M9 4v16M15 4v16M4 9h16M4 15h16"/>',
		minus: '<path d="M5 12h14"/>',
		pin: '<path d="M12 21s7-6.2 7-12a7 7 0 0 0-14 0c0 5.8 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
		cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
		playo: '<path d="M7 5l12 7-12 7z"/>',
		back: '<path d="M15 5l-7 7 7 7"/>',
		shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>',
		chevron: '<path d="M9 5l7 7-7 7"/>'
	} as const;
	export type IconName = keyof typeof PATHS;
</script>

<script lang="ts">
	let {
		name,
		size = 20,
		stroke = 1.8,
		label
	}: { name: IconName; size?: number; stroke?: number; label?: string } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width={stroke}
	stroke-linecap="round"
	stroke-linejoin="round"
	role={label ? 'img' : undefined}
	aria-label={label}
	aria-hidden={label ? undefined : 'true'}
>
	{@html PATHS[name]}
</svg>
