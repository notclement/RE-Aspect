/**
 * Input sanitisation + validation. Every user input goes through here.
 * The server (Supabase constraints / edge functions) repeats these checks — never trust the browser alone.
 */
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = <T>(error: string): Result<T> => ({ ok: false, error });

/** Strip control characters, collapse whitespace, trim. */
export function cleanText(input: string): string {
	return (
		input
			// eslint-disable-next-line no-control-regex
			.replace(/[\u0000-\u001F\u007F]/g, '')
			.replace(/\s+/g, ' ')
			.trim()
	);
}

/** Display name: 1–40 chars, letters (any language), spaces, . ' - only. */
export function validateName(input: string): Result<string> {
	const v = cleanText(input);
	if (!v) return fail('Please enter your name.');
	if (v.length > 40) return fail('Keep it under 40 characters.');
	if (!/^[\p{L}\p{M}][\p{L}\p{M} .'-]*$/u.test(v)) return fail('Use letters, spaces, . \' or - only.');
	return ok(v);
}

/**
 * Singapore unit number, e.g. "#18-04", "18-04", "#05-1234", "#12-03A".
 * Normalised to "#FF-UUUU[A]". Floor 1–3 digits, unit 1–4 digits, optional single trailing letter.
 */
export function validateUnitNumber(input: string, floorLevel?: number | null): Result<string> {
	const v = cleanText(input).toUpperCase().replace(/\s/g, '');
	if (!v) return fail('Please enter the unit number.');
	if (v.length > 10) return fail('That unit number is too long.');
	// Just the unit ("125") — combined with the floor level when we have it ("#05-125").
	const bare = /^#?(\d{1,4})([A-Z])?$/.exec(v);
	if (bare) {
		const unit = bare[1].padStart(2, '0') + (bare[2] ?? '');
		return ok(floorLevel && floorLevel > 0 ? `#${String(floorLevel).padStart(2, '0')}-${unit}` : unit);
	}
	const m = /^#?(\d{1,3})-(\d{1,4})([A-Z])?$/.exec(v);
	if (!m) return fail('Use the format #18-04 (an optional letter at the end is OK, e.g. #12-03A).');
	const floor = m[1].padStart(2, '0');
	const unit = m[2].padStart(2, '0');
	if (Number(floor) === 0) return fail('Floor must be 1 or higher.');
	return ok(`#${floor}-${unit}${m[3] ?? ''}`);
}

/** Project / building name: 1–60 chars, common punctuation only. */
export function validateProjectName(input: string): Result<string> {
	const v = cleanText(input);
	if (!v) return fail('Please enter the project name.');
	if (v.length > 60) return fail('Keep it under 60 characters.');
	if (!/^[\p{L}\p{M}\p{N} .,'&@()#/-]+$/u.test(v)) return fail('Remove unusual symbols.');
	return ok(v);
}

/** Generic bounded number (floor level, heights, sizes). */
export function validateNumber(
	input: string | number,
	{ min, max, label, decimals = 2 }: { min: number; max: number; label: string; decimals?: number }
): Result<number> {
	const n = typeof input === 'number' ? input : Number(cleanText(String(input)).replace(/,/g, ''));
	if (!Number.isFinite(n)) return fail(`${label} must be a number.`);
	if (n < min || n > max) return fail(`${label} must be between ${min} and ${max}.`);
	const f = 10 ** decimals;
	return ok(Math.round(n * f) / f);
}

export const validateFloorLevel = (v: string | number) =>
	validateNumber(v, { min: 1, max: 120, label: 'Floor level', decimals: 0 });
export const validateCeilingHeightM = (v: string | number) =>
	validateNumber(v, { min: 2.2, max: 6, label: 'Ceiling height (m)' });
export const validateSizeSqft = (v: string | number) =>
	validateNumber(v, { min: 150, max: 20000, label: 'Size (sq ft)', decimals: 0 });
export const validateBodyHeightCm = (v: string | number) =>
	validateNumber(v, { min: 100, max: 230, label: 'Height (cm)', decimals: 0 });

/**
 * Free text (descriptions, notes). Keeps line breaks when `multiline`, strips other control
 * characters and angle brackets, collapses runs of spaces, enforces a max length. Empty is allowed.
 */
export function validateFreeText(input: string, { max, label, multiline = false }: { max: number; label: string; multiline?: boolean }): Result<string> {
	let v = input
		// eslint-disable-next-line no-control-regex
		.replace(multiline ? /[\u0000-\u0009\u000B-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '')
		.replace(/[<>]/g, '')
		.replace(/[ \t]+/g, ' ');
	v = multiline ? v.replace(/\n{3,}/g, '\n\n').trim() : v.trim();
	if (v.length > max) return fail(`${label} must be under ${max} characters.`);
	return ok(v);
}
