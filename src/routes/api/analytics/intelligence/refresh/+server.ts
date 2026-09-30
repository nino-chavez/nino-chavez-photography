import { dev } from '$app/environment';
import { error, json } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { parseIntelligenceScope } from '$lib/analytics/intelligence-contract';
import { intelligenceOwner, queueIntelligenceRefresh } from '$lib/analytics/intelligence-store.server';
import type { RequestHandler } from './$types';
export const POST: RequestHandler = async ({ cookies, request, url }) => {
 if (request.headers.get('origin') !== (dev ? url.origin : 'https://analytics.ninochavez.co')) throw error(403, 'Use the reporting page.');
 const owner = await intelligenceOwner(cookies); if (!owner.owner) throw error(403, 'Owner sign-in is required.');
 const reader = request.body?.getReader(); if (!reader) throw error(400, 'Report scope required.');
 let bytes = 0; const chunks: Uint8Array[] = [];
 for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > 12000) { await reader.cancel(); throw error(413, 'Report scope is too large.'); } chunks.push(part.value); }
 const payload = new Uint8Array(bytes); let offset = 0; for (const chunk of chunks) { payload.set(chunk, offset); offset += chunk.length; }
 let value: unknown; try { value = JSON.parse(new TextDecoder().decode(payload)); } catch { throw error(400, 'Invalid report scope.'); }
 if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some((key) => key !== 'scope')) throw error(400, 'Invalid report scope.');
 const scope = parseIntelligenceScope((value as { scope?: unknown }).scope); if (!scope) throw error(400, 'Invalid report scope.');
 try { await queueIntelligenceRefresh(createSupabaseAdminClient(), scope); } catch { throw error(503, 'Report calculation could not be queued.'); }
 return json({ queued: true }, { status: 202, headers: { 'cache-control': 'private, no-store' } });
};
