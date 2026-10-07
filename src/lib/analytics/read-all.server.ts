/**
 * Every row of a table read a thousand at a time, or the error that stopped the read. An error is returned,
 * never thrown and never turned into an empty list the caller could mistake for "no rows".
 */
export async function readAll<T>(page: (from: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<{ data: T[]; error: unknown }> {
	const data: T[] = [];
	for (let from = 0; ; from += 1000) {
		const result = await page(from);
		if (result.error) return { data: [], error: result.error };
		data.push(...(result.data ?? []));
		if ((result.data ?? []).length < 1000) return { data, error: null };
	}
}
