import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { intelligenceOwner } from '$lib/analytics/intelligence-store.server';
import type { RequestHandler } from './$types';

const ANALYTICS_ORIGIN = 'https://analytics.ninochavez.co';
const BODY_LIMIT = 2048;

async function deleteConfirmation(request: Request): Promise<boolean> {
	const reader = request.body?.getReader();
	if (!reader) throw error(400, 'invalid private history confirmation');
	const chunks: Uint8Array[] = []; let total = 0;
	for (;;) {
		const next = await reader.read(); if (next.done) break;
		total += next.value.byteLength;
		if (total > BODY_LIMIT) throw error(413, 'private history request is too large');
		chunks.push(next.value);
	}
	const bytes = new Uint8Array(total); let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
		return !!value && typeof value === 'object' && !Array.isArray(value)
			&& Object.keys(value).length === 1 && (value as Record<string, unknown>).confirm === 'delete_private_history';
	} catch { throw error(400, 'invalid private history confirmation'); }
}

export const DELETE: RequestHandler = async ({ request, cookies, url }) => {
	if (request.headers.get('origin') !== (dev ? url.origin : ANALYTICS_ORIGIN)) throw error(403, 'cross-origin private history deletion rejected');
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'owner authorization required');
	if (!await deleteConfirmation(request)) throw error(400, 'confirm private history deletion');
	const { error: deleteError } = await createSupabaseAdminClient().rpc('analytics_delete_intelligence_private_history', { p_owner_id: owner.userId });
	if (deleteError) throw error(503, 'private history could not be deleted');
	return json({ deleted: true }, { headers: { 'cache-control': 'private, no-store' } });
};
