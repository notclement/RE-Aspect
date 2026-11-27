/** Readable message from a supabase.functions.invoke error (reads the function's JSON body when there is one). */
export async function fnError(error: unknown): Promise<string> {
	const ctx = (error as { context?: unknown })?.context;
	if (ctx instanceof Response) {
		try {
			const b = (await ctx.clone().json()) as { error?: string; detail?: string; provider?: string };
			const main = typeof b.error === 'string' ? b.error : `Error ${ctx.status}`;
			return (b.detail ? `${main} (${b.provider ?? 'AI'}: ${b.detail})` : main).slice(0, 300);
		} catch {
			return `Error ${ctx.status}`;
		}
	}
	return error instanceof Error ? error.message : 'Something went wrong.';
}
