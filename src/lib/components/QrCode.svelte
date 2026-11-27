<script lang="ts">
	/** QR code for a URL, drawn as crisp SVG. The encoder (~20 KB) is loaded only when a QR is shown. */
	let { text, size = 220, label = 'QR code' }: { text: string; size?: number; label?: string } = $props();
	let path = $state('');
	let n = $state(0);

	$effect(() => {
		const t = text;
		let alive = true;
		import('qrcode-generator').then(({ default: qrcode }) => {
			if (!alive) return;
			const qr = qrcode(0, 'M');
			qr.addData(t);
			qr.make();
			const count = qr.getModuleCount();
			let d = '';
			for (let r = 0; r < count; r++) for (let c = 0; c < count; c++) if (qr.isDark(r, c)) d += `M${c + 4} ${r + 4}h1v1h-1z`;
			n = count + 8; // 4-module quiet zone each side
			path = d;
		});
		return () => (alive = false);
	});

	/** PNG of the QR (for download / share). */
	export async function toPng(px = 1024): Promise<Blob | null> {
		if (!n) return null;
		const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><rect width="${n}" height="${n}" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
		const img = new Image();
		img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
		await img.decode();
		const c = document.createElement('canvas');
		c.width = c.height = px;
		const g = c.getContext('2d')!;
		g.imageSmoothingEnabled = false;
		g.drawImage(img, 0, 0, px, px);
		return new Promise((res) => c.toBlob((b) => res(b), 'image/png'));
	}
</script>

<div class="qr" style:width="{size}px" style:height="{size}px">
	{#if path}
		<svg viewBox="0 0 {n} {n}" width={size} height={size} role="img" aria-label={label} shape-rendering="crispEdges">
			<rect width={n} height={n} fill="#fff" />
			<path d={path} fill="#111" />
		</svg>
	{/if}
</div>

<style>
	.qr {
		display: grid;
		place-items: center;
		background: #fff;
		border-radius: 12px;
		overflow: hidden;
		flex-shrink: 0;
	}
	svg {
		display: block;
	}
</style>
