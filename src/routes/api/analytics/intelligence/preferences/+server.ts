import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { intelligenceOwner } from '$lib/analytics/intelligence-store.server';
import { parseIntelligencePreferences, retentionDays, type IntelligencePreferences } from '$lib/analytics/intelligence-preferences';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'Sign in as the owner to see reporting preferences.');
	const client = createSupabaseAdminClient();
	const preferences = await client.from('analytics_intelligence_preferences').select('retention_policy, retention_days, external_enabled, destination, destination_verified').eq('owner_id', owner.userId).maybeSingle();
	if (preferences.error) throw error(503, 'Reporting preferences could not be read.');
	const row = preferences.data;
	const result: IntelligencePreferences = {
		retention: row?.retention_policy === 'until_deleted' ? 'until_deleted' : row?.retention_days === 90 ? '90_days' : row?.retention_days === 365 ? 'one_year' : 'undecided',
		externalEnabled: row?.external_enabled === true,
		destination: row?.destination ?? null, destinationVerified: row?.destination_verified === true
	};
	return json(result, { headers: { 'cache-control': 'private, no-store' } });
};

export const POST: RequestHandler = async ({ cookies, request, url }) => {
	if (request.headers.get('origin') !== (dev ? url.origin : 'https://analytics.ninochavez.co')) throw error(403, 'Use this reporting page to change preferences.');
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'Owner sign-in is required.');
	const reader = request.body?.getReader(); if (!reader) throw error(400, 'Choose valid reporting preferences.');
	let total = 0; const chunks: Uint8Array[] = [];
	for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.byteLength; if (total > 1024) { await reader.cancel(); throw error(413, 'The request is too large.'); } chunks.push(part.value); }
	const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
	const raw = new TextDecoder().decode(bytes);
	let value: unknown; try { value = JSON.parse(raw); } catch { throw error(400, 'Choose valid reporting preferences.'); }
	const parsed = parseIntelligencePreferences(value);
	if (!parsed) throw error(400, 'Choose a retention period.');
	const { error: saveError } = await createSupabaseAdminClient().rpc('analytics_set_intelligence_preferences', {
		p_owner_id: owner.userId,
		p_retention_policy: parsed.retention === 'until_deleted' ? 'until_deleted' : 'days',
		p_retention_days: retentionDays(parsed.retention),
		// Launch recaps replaced the daily and weekly briefs. The function still writes a schedule row, so it is written
		// switched off: nothing reads it, and a row left on by an older version could never queue a brief again.
		p_daily_enabled: false, p_weekly_enabled: false
	});
	if (saveError) throw error(503, 'Preferences were not saved.');
	return json({ saved: true }, { headers: { 'cache-control': 'private, no-store' } });
};
