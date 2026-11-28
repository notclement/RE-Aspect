/** Brand + credit constants. One place to change naming. */
export const BRAND = {
	name: 'RE:Aspect',
	/** Core sun feature — the main selling point. */
	sunFeature: 'DayTrace',
	proTier: 'RE:Aspect Pro',
	/** For agents & designers (our customers): sign-in, app, install card, manifest. */
	tagline: 'Show clients the light in every room, before they visit.',
	/** For buyers / homeowners who open a shared link (shared page, link previews). */
	buyerLine: 'See the light before you move in.',
	/** Data-protection contact shown on /legal (PDPA). null = link to the developer's LinkedIn until set. */
	contactEmail: null as string | null,
	developer: {
		name: 'Clement',
		linkedin: 'https://www.linkedin.com/in/clementsg'
	}
} as const;
