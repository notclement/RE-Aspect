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
