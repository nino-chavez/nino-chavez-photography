import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { error, json } from '@sveltejs/kit';
import { emailIntelligenceDeliveryConfigured, emailIntelligenceDeliveryState, parseEmailIntelligenceDeliveryChange } from '$lib/analytics/intelligence-email-preferences';
import { intelligenceOwner } from '$lib/analytics/intelligence-store.server';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import type { RequestHandler } from './$types';

const ANALYTICS_ORIGIN = 'https://analytics.ninochavez.co';
const BODY_LIMIT = 512;

function configured() {
	return emailIntelligenceDeliveryConfigured({
		enabled: env.ANALYTICS_INTELLIGENCE_DELIVERY_ENABLED,
		from: env.ANALYTICS_INTELLIGENCE_EMAIL_FROM,
		token: env.ANALYTICS_INTELLIGENCE_DELIVERY_TOKEN
	});
}

async function bodyValue(request: Request): Promise<unknown> {
	const reader = request.body?.getReader();
	if (!reader) throw error(400, 'Choose a valid email delivery action.');
	const chunks: Uint8Array[] = []; let total = 0;
	for (;;) {
		const next = await reader.read(); if (next.done) break;
		total += next.value.byteLength;
		if (total > BODY_LIMIT) { await reader.cancel(); throw error(413, 'Email delivery request is too large.'); }
		chunks.push(next.value);
	}
	const bytes = new Uint8Array(total); let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	try { return JSON.parse(new TextDecoder().decode(bytes)); }
	catch { throw error(400, 'Choose a valid email delivery action.'); }
}

async function ownerWithConfirmedEmail(cookies: Parameters<RequestHandler>[0]['cookies']) {
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'Owner sign-in is required.');
	const { data: { user }, error: userError } = await createSupabaseServerClient(cookies).auth.getUser();
	if (userError || !user) throw error(403, 'Owner sign-in is required.');
	return { owner, user };
}

export const GET: RequestHandler = async ({ cookies }) => {
	const { owner, user } = await ownerWithConfirmedEmail(cookies);
	const client = createSupabaseAdminClient();
	const { data, error: preferenceError } = await client.from('analytics_intelligence_preferences')
		.select('external_enabled, destination_verified, destination_verified_at, destination, sender, retention_policy')
		.eq('owner_id', owner.userId).maybeSingle();
	if (preferenceError) throw error(503, 'Email delivery settings are unavailable.');
	const confirmedEmail = user.email_confirmed_at ? user.email : null;
	return json(emailIntelligenceDeliveryState(data, confirmedEmail, configured()), { headers: { 'cache-control': 'private, no-store' } });
};

export const POST: RequestHandler = async ({ cookies, request, url }) => {
	if (request.headers.get('origin') !== (dev ? url.origin : ANALYTICS_ORIGIN)) throw error(403, 'Use this reporting page to change email delivery.');
	const { owner, user } = await ownerWithConfirmedEmail(cookies);
	const change = parseEmailIntelligenceDeliveryChange(await bodyValue(request));
	if (!change) throw error(400, 'Choose a valid email delivery action.');
	const client = createSupabaseAdminClient();

	if (!change.enabled) {
		const { error: disableError } = await client.from('analytics_intelligence_preferences').update({ external_enabled: false, sender: 'owned' }).eq('owner_id', owner.userId);
		if (disableError) throw error(503, 'Email delivery was not disabled.');
		return json({ saved: true }, { headers: { 'cache-control': 'private, no-store' } });
	}

	if (!configured()) throw error(409, 'Email delivery is unavailable until its server configuration is ready.');
	if (!user.email || !user.email_confirmed_at || Number.isNaN(Date.parse(user.email_confirmed_at))) throw error(409, 'Confirm the owner email before activating delivery.');
	const { data: preference, error: readError } = await client.from('analytics_intelligence_preferences').select('retention_policy').eq('owner_id', owner.userId).maybeSingle();
	if (readError) throw error(503, 'Private retention settings are unavailable.');
	if (!preference || preference.retention_policy === 'undecided') throw error(409, 'Choose private record retention before activating email delivery.');
	const { error: saveError } = await client.from('analytics_intelligence_preferences').upsert({
		owner_id: owner.userId, external_enabled: true, destination_verified: true,
		destination_verified_at: user.email_confirmed_at, destination: user.email, sender: 'owned'
	}, { onConflict: 'owner_id' });
	if (saveError) throw error(503, 'Email delivery was not activated.');
	return json({ saved: true }, { headers: { 'cache-control': 'private, no-store' } });
};
