import { dev } from '$app/environment';
import { json, error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { parseIntelligenceScope, type IntelligenceAction } from '$lib/analytics/intelligence-contract';
import { intelligenceOwner, recordIntelligenceAction } from '$lib/analytics/intelligence-store.server';
import type { RequestHandler } from './$types';

const ANALYTICS_ORIGIN = 'https://analytics.ninochavez.co';
const BODY_LIMIT = 8_000;
const validKinds = new Set<IntelligenceAction['kind']>(['record', 'dismiss', 'snooze', 'undo']);
const UUID = /^[0-9a-f-]{36}$/i;
const measure = new Set(['photo_opens', 'album_opens', 'downloads', 'favorites', 'shares', 'page_views']);
const changeType = new Set(['promotion', 'cover', 'headline', 'cta', 'search_fix', 'download_repair', 'shooting', 'editing', 'other']);
const outcome = new Set(['unknown', 'inquiry', 'booking', 'other']);
const text = (value: unknown, limit: number) => value === undefined ? null : typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit ? value.trim() : undefined;
const instant = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

async function boundedBody(request: Request): Promise<Record<string, unknown>> {
	const reader = request.body?.getReader();
	if (!reader) throw error(400, 'invalid JSON');
	const chunks: Uint8Array[] = []; let total = 0;
	for (;;) {
		const next = await reader.read(); if (next.done) break;
		total += next.value.byteLength; if (total > BODY_LIMIT) throw error(413, 'analytics action body is too large');
		chunks.push(next.value);
	}
	try {
		const value: unknown = JSON.parse(new TextDecoder().decode(Buffer.concat(chunks)));
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
		return value as Record<string, unknown>;
	} catch { throw error(400, 'invalid JSON'); }
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (request.headers.get('origin') !== (dev ? url.origin : ANALYTICS_ORIGIN)) throw error(403, 'cross-origin analytics action rejected');
	const length = Number(request.headers.get('content-length') ?? '0');
	if (!Number.isSafeInteger(length) || length < 0 || length > BODY_LIMIT) throw error(413, 'analytics action body is too large');
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'owner authorization required');
	const body = await boundedBody(request);
	const allowed = new Set(['scope', 'kind', 'findingId', 'actionId', 'actualAt', 'hypothesis', 'primaryMeasure', 'note', 'changeType', 'channel', 'campaign', 'release', 'variant', 'outcome', 'observationDays']);
	if (Object.keys(body).some((key) => !allowed.has(key))) throw error(400, 'unknown analytics action field');
	const scope = parseIntelligenceScope(body.scope); const kind = body.kind as IntelligenceAction['kind'];
	const findingId = typeof body.findingId === 'string' && body.findingId.length <= 120 ? body.findingId : null;
	const actionId = typeof body.actionId === 'string' && UUID.test(body.actionId) ? body.actionId : null;
	const actualAt = instant(body.actualAt); const hypothesis = text(body.hypothesis, 500); const primaryMeasure = text(body.primaryMeasure, 80); const note = text(body.note, 1000);
	const type = text(body.changeType, 40); const channel = text(body.channel, 80); const campaign = text(body.campaign, 120); const release = text(body.release, 120); const variant = text(body.variant, 120); const coarseOutcome = text(body.outcome, 20);
	const observationDays = Number.isSafeInteger(body.observationDays) && (body.observationDays as number) >= 1 && (body.observationDays as number) <= 365 ? body.observationDays as number : null;
	if (!scope || !validKinds.has(kind) || hypothesis === undefined || primaryMeasure === undefined || note === undefined || type === undefined || channel === undefined || campaign === undefined || release === undefined || variant === undefined || coarseOutcome === undefined) throw error(400, 'invalid analytics action');
	if (kind === 'record' && (!findingId || !actualAt || !hypothesis || !primaryMeasure || !measure.has(primaryMeasure) || !type || !changeType.has(type) || !observationDays || (coarseOutcome && !outcome.has(coarseOutcome)))) throw error(400, 'recorded actions need a visible finding, actual time, hypothesis, measure, change context, and observation window');
	if (kind === 'undo' && !actionId) throw error(400, 'undo requires an owned action id');
	if (kind !== 'undo' && !findingId) throw error(400, 'finding reference required');
	try {
		const action = await recordIntelligenceAction(createSupabaseAdminClient(), owner.userId, scope, { kind, findingId, actionId, target: null, actualAt, hypothesis, primaryMeasure, note, changeType: type as IntelligenceAction['changeType'], channel, campaign, release, variant, outcome: coarseOutcome as IntelligenceAction['outcome'], observationDays });
		return json({ action }, { headers: { 'cache-control': 'no-store' } });
	} catch { throw error(403, 'analytics action unavailable'); }
};
