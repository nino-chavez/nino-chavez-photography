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
const text = (value: unknown, limit: number) => value === undefined ? null : typeof value === 'string' && value.trim().length > 0 && value.trim().length <= limit ? value.trim() : undefined;
const instant = (value: unknown) => typeof value === 'string' && !Number.isNaN(Date.parse(value)) ? value : null;

export const POST: RequestHandler = async ({ request, cookies, url }) => {
	if (request.headers.get('origin') !== (dev ? url.origin : ANALYTICS_ORIGIN)) throw error(403, 'cross-origin analytics action rejected');
	const length = Number(request.headers.get('content-length') ?? '0');
	if (!Number.isSafeInteger(length) || length < 0 || length > BODY_LIMIT) throw error(413, 'analytics action body is too large');
	const owner = await intelligenceOwner(cookies);
	if (!owner.owner || !owner.userId) throw error(403, 'owner authorization required');
	let body: Record<string, unknown>; try { const raw: unknown = await request.json(); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid'); body = raw as Record<string, unknown>; } catch { throw error(400, 'invalid JSON'); }
	const allowed = new Set(['scope', 'kind', 'findingId', 'actionId', 'actualAt', 'hypothesis', 'primaryMeasure', 'note']);
	if (Object.keys(body).some((key) => !allowed.has(key))) throw error(400, 'unknown analytics action field');
	const scope = parseIntelligenceScope(body.scope); const kind = body.kind as IntelligenceAction['kind'];
	const findingId = typeof body.findingId === 'string' && body.findingId.length <= 120 ? body.findingId : null;
	const actionId = typeof body.actionId === 'string' && UUID.test(body.actionId) ? body.actionId : null;
	const actualAt = instant(body.actualAt); const hypothesis = text(body.hypothesis, 500); const primaryMeasure = text(body.primaryMeasure, 80); const note = text(body.note, 1000);
	if (!scope || !validKinds.has(kind) || hypothesis === undefined || primaryMeasure === undefined || note === undefined) throw error(400, 'invalid analytics action');
	if (kind === 'record' && (!findingId || !actualAt || !hypothesis || !primaryMeasure || !measure.has(primaryMeasure))) throw error(400, 'recorded actions need a visible finding, actual time, hypothesis, and supported measure');
	if (kind === 'undo' && !actionId) throw error(400, 'undo requires an owned action id');
	if (kind !== 'undo' && !findingId) throw error(400, 'finding reference required');
	try {
		const action = await recordIntelligenceAction(createSupabaseAdminClient(), owner.userId, scope, { kind, findingId, actionId, target: null, actualAt, hypothesis, primaryMeasure, note });
		return json({ action }, { headers: { 'cache-control': 'no-store' } });
	} catch { throw error(403, 'analytics action unavailable'); }
};
