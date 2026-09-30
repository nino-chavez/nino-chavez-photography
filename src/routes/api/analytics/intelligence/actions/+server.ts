import { dev } from '$app/environment';
import { json, error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { parseIntelligenceScope, parsePublicIntelligenceTarget, type IntelligenceAction } from '$lib/analytics/intelligence-contract';
import { intelligenceOwner, recordIntelligenceAction, retentionChosen } from '$lib/analytics/intelligence-store.server';
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
		const bytes = new Uint8Array(total); let offset = 0; for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
		const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
		if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid');
		return value as Record<string, unknown>;
	} catch { throw error(400, 'invalid JSON'); }
}

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (request.headers.get('origin') !== (dev ? url.origin : ANALYTICS_ORIGIN)) throw error(403, 'cross-origin analytics action rejected');
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'owner authorization required');
	const body = await boundedBody(request);
	const allowed = new Set(['scope', 'kind', 'findingId', 'actionId', 'publicTarget', 'actualAt', 'hypothesis', 'primaryMeasure', 'note', 'changeType', 'channel', 'campaign', 'release', 'variant', 'outcome', 'outcomeCount', 'observationDays']);
	if (Object.keys(body).some((key) => !allowed.has(key))) throw error(400, 'unknown analytics action field');
	const scope = parseIntelligenceScope(body.scope); const kind = body.kind as IntelligenceAction['kind'];
	const findingId = typeof body.findingId === 'string' && body.findingId.length <= 120 ? body.findingId : null;
	const actionId = typeof body.actionId === 'string' && UUID.test(body.actionId) ? body.actionId : null;
	const publicTarget = body.publicTarget === undefined ? null : parsePublicIntelligenceTarget(body.publicTarget);
	const actualAt = instant(body.actualAt); const hypothesis = text(body.hypothesis, 500); const primaryMeasure = text(body.primaryMeasure, 80); const note = text(body.note, 1000);
	const type = text(body.changeType, 40); const channel = text(body.channel, 80); const campaign = text(body.campaign, 120); const release = text(body.release, 120); const variant = text(body.variant, 120); const coarseOutcome = text(body.outcome, 20);
	const observationDays = Number.isSafeInteger(body.observationDays) && (body.observationDays as number) >= 1 && (body.observationDays as number) <= 365 ? body.observationDays as number : null;
	const outcomeCount = body.outcomeCount === undefined ? null : Number.isSafeInteger(body.outcomeCount) && (body.outcomeCount as number) >= 0 && (body.outcomeCount as number) <= 10_000 ? body.outcomeCount as number : undefined;
	if (!scope || !validKinds.has(kind) || hypothesis === undefined || primaryMeasure === undefined || note === undefined || type === undefined || channel === undefined || campaign === undefined || release === undefined || variant === undefined || coarseOutcome === undefined) throw error(400, 'invalid analytics action');
	if (body.publicTarget !== undefined && !publicTarget) throw error(400, 'invalid public action target');
	if (kind === 'record' && (!actualAt || Date.parse(actualAt) > Date.now() || !hypothesis || !primaryMeasure || !measure.has(primaryMeasure) || !type || !changeType.has(type) || !observationDays || outcomeCount === undefined || (coarseOutcome && !outcome.has(coarseOutcome)))) throw error(400, 'recorded actions need an occurred action time, hypothesis, measure, change context, and observation window');
	if (kind === 'undo' && !actionId) throw error(400, 'undo requires an owned action id');
	if (kind !== 'undo' && kind !== 'record' && !findingId) throw error(400, 'finding reference required');
	if (kind === 'record' && !findingId && !publicTarget) throw error(400, 'standalone records need a public target');
	const client = createSupabaseAdminClient();
	if (!await retentionChosen(client, owner.userId)) throw error(409, 'choose private record retention before saving an action');
	try {
		const action = await recordIntelligenceAction(client, owner.userId, scope, { kind, findingId, actionId, target: publicTarget, actualAt, hypothesis, primaryMeasure, note, changeType: type as IntelligenceAction['changeType'], channel, campaign, release, variant, outcome: coarseOutcome as IntelligenceAction['outcome'], outcomeCount, observationDays });
		return json({ action }, { headers: { 'cache-control': 'no-store' } });
	} catch (cause) {
		if (cause instanceof Error && cause.message === 'retention decision required') throw error(409, 'choose private record retention before saving an action');
		throw error(400, 'analytics action unavailable');
	}
};
