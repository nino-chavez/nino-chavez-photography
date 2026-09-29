import { json, error } from '@sveltejs/kit';
import { createSupabaseAdminClient } from '$lib/supabase/server-ssr';
import { resolveAnalyticsContext } from '$lib/analytics/context.server';
import { isBotUserAgent } from '$lib/analytics/bot-detection';
import { parseCollectionRequest, resolveCollectionTarget } from '$lib/analytics/collection-contract';
import { parseDownloadDiagnostic } from '$lib/analytics/diagnostics-contract';
import type { RequestHandler } from './$types';

/** Browser download APIs cannot observe a completed file transfer. Record the actual request/failure only. */
export const POST: RequestHandler = async ({ request, cookies }) => {
	let input: unknown;
	let body;
	try { input = await request.json(); } catch { throw error(400, 'invalid JSON'); }
	body = parseDownloadDiagnostic(input);
	if (!body) throw error(400, 'invalid diagnostic');
 const parsed=parseCollectionRequest({event_type:'download',photo_id:body.photo_id,album_key:body.album_key,source:body.source});
 if(!parsed.ok)throw error(400,'invalid diagnostic target');
 if(isBotUserAgent(request.headers.get('user-agent')))return json({ok:false,accepted:false,reason:'known_crawler'},{status:202});
 const admin=createSupabaseAdminClient();
 let target;
 try {target=await resolveCollectionTarget(parsed.value,{
  async albumForPhoto(id){const result=await admin.from('photo_metadata').select('album_key').eq('photo_id',id).maybeSingle();if(result.error)throw result.error;return result.data?.album_key??null;},
  async albumExists(key){const result=await admin.from('albums').select('album_key').eq('album_key',key).maybeSingle();if(result.error)throw result.error;return !!result.data;}
 });}catch{return json({ok:false,error:'recording_unavailable'},{status:503});}
 if(!target.ok)throw error(400,target.error);
	const traffic_context = await resolveAnalyticsContext(request, cookies);
	const { error: dbError } = await admin.from('analytics_collection_diagnostics').insert({
		diagnostic_type: body.type, status: body.status, album_key: target.value.album_key, photo_id: target.value.photo_id,
		source: body.source?.slice(0, 120) || 'direct', error_code: body.error_code?.slice(0, 120) ?? null, result_count: body.result_count ?? null, traffic_context
	});
	if (dbError) return json({ ok: false, error: 'recording_unavailable' }, { status: 503 });
	return json({ ok: true });
};
