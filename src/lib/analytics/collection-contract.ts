import { createHmac, timingSafeEqual } from 'node:crypto';
import { ID_PATTERN, eventPropertiesMatchContract, isEventV2Name, isSafeEventProperty, type AcceptedEventV2, type EventV2Properties } from './events-v2';

const EVENT_TYPES = ['view', 'favorite', 'download', 'share', 'album_open'] as const;
export type CollectionEventType = (typeof EVENT_TYPES)[number];

export interface CollectionRequest {
	event_type: CollectionEventType;
	photo_id: string | null;
	album_key: string | null;
	source: string | null;
}

export type CollectionRequestResult =
	| { ok: true; value: CollectionRequest }
	| { ok: false; error: string };

export interface CollectionTargetLookup {
	albumForPhoto(photoId: string): Promise<string | null>;
	albumExists(albumKey: string): Promise<boolean>;
}

export type EventV2Request = Omit<AcceptedEventV2, 'received_at' | 'traffic_context' | 'export_eligible'>;
export type EventV2RequestResult =
	| { ok: true; value: EventV2Request }
	| { ok: false; error: string };

function isoTimestamp(value: unknown, now = Date.now()): string | null {
	if (typeof value !== 'string' || value.length > 40) return null;
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) && Math.abs(now - timestamp) <= 24 * 60 * 60 * 1000 ? new Date(timestamp).toISOString() : null;
}

/** Parses only properties approved for export; raw search text and identifiers are rejected at the edge. */
export function parseEventV2Request(input: unknown, now = Date.now()): EventV2RequestResult {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid request body' };
	const body = input as Record<string, unknown>;
	if (body.schema_version !== 2 || !isEventV2Name(body.event_name) || typeof body.event_id !== 'string' || !ID_PATTERN.test(body.event_id)) {
		return { ok: false, error: 'invalid event identity' };
	}
	const occurredAt = isoTimestamp(body.occurred_at, now);
	if (!occurredAt) return { ok: false, error: 'invalid occurred_at' };
	const browserId = body.anonymous_browser_id;
	const visitId = body.visit_id;
	if ((browserId !== null && (typeof browserId !== 'string' || !ID_PATTERN.test(browserId))) ||
		(visitId !== null && (typeof visitId !== 'string' || !ID_PATTERN.test(visitId)))) {
		return { ok: false, error: 'invalid visit context' };
	}
	if ((browserId === null) !== (visitId === null)) return { ok: false, error: 'incomplete visit context' };
	if (!body.properties || typeof body.properties !== 'object' || Array.isArray(body.properties)) return { ok: false, error: 'invalid properties' };
	const properties: EventV2Properties = {};
	for (const [key, value] of Object.entries(body.properties as Record<string, unknown>)) {
		if (!isSafeEventProperty(key, value)) return { ok: false, error: 'invalid event property' };
		properties[key] = value;
	}
	if (Object.keys(properties).length > 20) return { ok: false, error: 'too many event properties' };
	if (!eventPropertiesMatchContract(body.event_name, properties)) return { ok: false, error: 'event properties do not match contract' };
	return {
		ok: true,
		value: { event_id: body.event_id, schema_version: 2, event_name: body.event_name, occurred_at: occurredAt,
			anonymous_browser_id: browserId as string | null, visit_id: visitId as string | null, properties }
	};
}

export async function resolveEventV2Target(
	request: EventV2Request,
	lookup: CollectionTargetLookup
): Promise<EventV2RequestResult> {
	const photoId = request.properties.photo_id;
	const albumKey = request.properties.album_key;
	if (typeof photoId === 'string' && photoId) {
		const authoritativeAlbum = await lookup.albumForPhoto(photoId);
		if (!authoritativeAlbum) return { ok: false, error: 'photo target not found' };
		if (albumKey && albumKey !== authoritativeAlbum) return { ok: false, error: 'photo and album targets do not match' };
		return { ok: true, value: { ...request, properties: { ...request.properties, album_key: authoritativeAlbum } } };
	}
	if (typeof albumKey === 'string' && albumKey && !(await lookup.albumExists(albumKey))) return { ok: false, error: 'album target not found' };
	return { ok: true, value: request };
}

function optionalString(value: unknown, maxLength: number): string | null | undefined {
	if (value === undefined || value === null) return null;
	if (typeof value !== 'string') return undefined;
	const trimmed = value.trim();
	if (!trimmed || trimmed.length > maxLength) return undefined;
	return trimmed;
}

/** Public collection accepts only explicit event/target shapes. */
export function parseCollectionRequest(input: unknown): CollectionRequestResult {
	if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'invalid request body' };
	const body = input as Record<string, unknown>;
	if (typeof body.event_type !== 'string' || !EVENT_TYPES.includes(body.event_type as CollectionEventType)) {
		return { ok: false, error: 'invalid event_type' };
	}
	const photoId = optionalString(body.photo_id, 256);
	const albumKey = optionalString(body.album_key, 256);
	const source = optionalString(body.source, 160);
	if (photoId === undefined || albumKey === undefined || source === undefined) {
		return { ok: false, error: 'invalid target or source' };
	}
	const eventType = body.event_type as CollectionEventType;
	if (eventType === 'view' && !photoId) {
		return { ok: false, error: 'photo view requires photo_id' };
	}
	if (eventType === 'album_open' && (!albumKey || photoId)) {
		return { ok: false, error: 'album_open requires album_key and no photo_id' };
	}
	if (eventType !== 'view' && eventType !== 'album_open' && !photoId && !albumKey) {
		return { ok: false, error: 'action requires photo_id or album_key' };
	}
	return {
		ok: true,
		value: { event_type: eventType, photo_id: photoId, album_key: albumKey, source }
	};
}

/** Resolve the authoritative album before insertion; never trust a client pair. */
export async function resolveCollectionTarget(
	request: CollectionRequest,
	lookup: CollectionTargetLookup
): Promise<CollectionRequestResult> {
	if (request.photo_id) {
		const authoritativeAlbum = await lookup.albumForPhoto(request.photo_id);
		if (!authoritativeAlbum) return { ok: false, error: 'photo target not found' };
		if (request.album_key && request.album_key !== authoritativeAlbum) {
			return { ok: false, error: 'photo and album targets do not match' };
		}
		return { ok: true, value: { ...request, album_key: authoritativeAlbum } };
	}
	if (request.album_key && !(await lookup.albumExists(request.album_key))) {
		return { ok: false, error: 'album target not found' };
	}
	return { ok: true, value: request };
}

export type CollectionOutcome =
	| { status: 200; body: { ok: true; accepted: true; duplicate: false } }
	| { status: 200; body: { ok: true; accepted: false; duplicate: true } }
	| { status: 400; body: { ok: false; accepted: false; error: 'invalid_target' } }
	| { status: 503; body: { ok: false; accepted: false; error: 'recording_unavailable' } };

/** Supabase resolves database failures; this makes the response decision explicit and testable. */
export function collectionOutcome(error: { code?: string } | null): CollectionOutcome {
	if (!error) return { status: 200, body: { ok: true, accepted: true, duplicate: false } };
	if (error.code === '23505') return { status: 200, body: { ok: true, accepted: false, duplicate: true } };
	if (error.code === '23503' || error.code === '23514' || error.code === '22P02') {
		return { status: 400, body: { ok: false, accepted: false, error: 'invalid_target' } };
	}
	return { status: 503, body: { ok: false, accepted: false, error: 'recording_unavailable' } };
}

interface TestMarkerPayload {
	exp: number;
	origin: string;
	pathPrefix: string;
}

function signature(payload: string, secret: string): string {
	return createHmac('sha256', secret).update(`analytics-test.v1.${payload}`).digest('base64url');
}

/** Used by controlled test clients. The marker is short-lived and cannot grant operator access. */
export function createAnalyticsTestMarker(payload: TestMarkerPayload, secret: string): string {
	const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
	return `v1.${encoded}.${signature(encoded, secret)}`;
}

/**
 * Body/query context is never trusted. A test marker must be signed, unexpired,
 * bound to the request origin, and limited to a route prefix. Static shared
 * header values are deliberately rejected.
 */
export function hasTrustedAnalyticsTestMarker(
	candidate: string | null,
	secret: string | undefined,
	request: Pick<Request, 'url' | 'headers'>,
	nowMs = Date.now(),
	trustedOrigin = new URL(request.url).origin
): boolean {
	if (!candidate || !secret || candidate.split('.').length!==3) return false;
	const [version, encoded, supplied] = candidate.split('.');
	if (version !== 'v1' || !encoded || !supplied) return false;
	const expected = signature(encoded, secret);
	const suppliedBytes = Buffer.from(supplied);
	const expectedBytes = Buffer.from(expected);
	if (suppliedBytes.length !== expectedBytes.length || !timingSafeEqual(suppliedBytes, expectedBytes)) return false;
	let payload: TestMarkerPayload;
	try { payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TestMarkerPayload; }
	catch { return false; }
	const url = new URL(request.url);
	const origin = request.headers.get('origin');
	return Number.isSafeInteger(payload.exp)
		&& payload.exp >= Math.floor(nowMs / 1000)
		&& payload.exp <= Math.floor(nowMs / 1000) + 15 * 60
		&& payload.origin === trustedOrigin
		&& origin === payload.origin
		&& typeof payload.pathPrefix==='string'
		&& payload.pathPrefix.startsWith('/')
		&& (payload.pathPrefix==='/' || url.pathname===payload.pathPrefix || url.pathname.startsWith(`${payload.pathPrefix.replace(/\/$/,'')}/`));
}
