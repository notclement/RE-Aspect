/**
 * Small client-side image helpers. Profile photos become a tiny square WebP (≈3–8 KB) before upload,
 * so nothing large is ever sent or stored.
 */
export const AVATAR_PX = 128;
export const AVATAR_MAX_CHARS = 16000; // mirrors the DB check on profiles.avatar
const AVATAR_RE = /^data:image\/(webp|jpeg);base64,[A-Za-z0-9+/=]+$/;

export const isAvatarDataUrl = (v: unknown): v is string =>
	typeof v === 'string' && v.length <= AVATAR_MAX_CHARS && AVATAR_RE.test(v);

/** Centre-crop to a square and shrink to `px`, as WebP (JPEG where WebP encoding isn't supported). */
export async function makeAvatar(file: File, px = AVATAR_PX): Promise<string> {
	if (!file.type.startsWith('image/')) throw new Error('Please choose an image.');
	if (file.size > 20 * 1024 * 1024) throw new Error('That image is too large (max 20 MB).');
	const bmp = await createImageBitmap(file);
	const side = Math.min(bmp.width, bmp.height);
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = px;
	const ctx = canvas.getContext('2d');
	if (!ctx) throw new Error('Could not process the image.');
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, px, px);
	bmp.close();
	for (const q of [0.75, 0.6, 0.45, 0.3]) {
		let url = canvas.toDataURL('image/webp', q);
		if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q);
		if (isAvatarDataUrl(url)) return url;
	}
	throw new Error('Could not make that image small enough — try another photo.');
}

export interface Shrunk {
	dataUrl: string;
	w: number;
	h: number;
}

function encode(canvas: HTMLCanvasElement, q = 0.82): string {
	const url = canvas.toDataURL('image/webp', q);
	return url.startsWith('data:image/webp') ? url : canvas.toDataURL('image/jpeg', q);
}

/**
 * Shrink a photo in the browser (long side ≤ maxSide). Re-encoding drops EXIF/GPS data.
 * Typically 10× smaller than the camera original.
 */
/** `jpeg` = always JPEG (for server-side image tools that can't read WebP). */
export async function shrinkPhoto(src: Blob | string, maxSide = 2048, q = 0.82, jpeg = false): Promise<Shrunk> {
	const bmp = typeof src === 'string' ? await createImageBitmap(await (await fetch(src)).blob()) : await createImageBitmap(src);
	const k = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
	const w = Math.max(1, Math.round(bmp.width * k));
	const h = Math.max(1, Math.round(bmp.height * k));
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d')!;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bmp, 0, 0, w, h);
	bmp.close();
	return { dataUrl: jpeg ? c.toDataURL('image/jpeg', q) : encode(c, q), w, h };
}

/** Rotate an image by any angle (degrees, clockwise) onto a white background that fits the result. */
/**
 * Split a north turn into the quarter turns we apply to the photo (so the drawing stays straight and its walls
 * trace square) and the small leftover angle, kept as the plan's bearing for the sun maths.
 */
export function splitNorth(deg: number): { quarter: number; bearing: number } {
	const a = ((deg % 360) + 360) % 360;
	const q = Math.round(a / 90) * 90;
	return { quarter: q % 360, bearing: Math.round((a - q) * 10) / 10 };
}

export async function rotateImage(dataUrl: string, deg: number, maxSide = 2048): Promise<Shrunk> {
	const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
	const r = (deg * Math.PI) / 180;
	const cos = Math.abs(Math.cos(r));
	const sin = Math.abs(Math.sin(r));
	let w = bmp.width * cos + bmp.height * sin;
	let h = bmp.width * sin + bmp.height * cos;
	const k = Math.min(1, maxSide / Math.max(w, h));
	w = Math.round(w * k);
	h = Math.round(h * k);
	const c = document.createElement('canvas');
	c.width = w;
	c.height = h;
	const ctx = c.getContext('2d')!;
	ctx.fillStyle = '#fff';
	ctx.fillRect(0, 0, w, h);
	ctx.translate(w / 2, h / 2);
	ctx.rotate(r);
	ctx.scale(k, k);
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2);
	bmp.close();
	return { dataUrl: encode(c, 0.85), w, h };
}

/** Crop a square region (in source pixels) and make the tiny profile photo from it. */
export async function makeAvatarFromRegion(file: Blob, sx: number, sy: number, side: number, px = AVATAR_PX): Promise<string> {
	const bmp = await createImageBitmap(file);
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = px;
	const ctx = canvas.getContext('2d')!;
	ctx.imageSmoothingQuality = 'high';
	ctx.drawImage(bmp, sx, sy, side, side, 0, 0, px, px);
	bmp.close();
	for (const q of [0.75, 0.6, 0.45, 0.3]) {
		let url = canvas.toDataURL('image/webp', q);
		if (!url.startsWith('data:image/webp')) url = canvas.toDataURL('image/jpeg', q);
		if (isAvatarDataUrl(url)) return url;
	}
	throw new Error('Could not make that image small enough — try another photo.');
}
