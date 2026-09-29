import { dev } from '$app/environment';
import { SITE_ORIGIN } from '$lib/site-url';
import { error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { hasTrustedAnalyticsTestMarker } from '$lib/analytics/collection-contract';
import type { Cookies } from '@sveltejs/kit';

export type AnalyticsTrafficContext = 'audience' | 'operator' | 'test';

/**
 * Context is proven server-side. Client body/query values are intentionally not
 * accepted: a visitor cannot exclude themselves by sending `{ context: 'test' }`.
 */
export async function resolveAnalyticsContext(request: Request, cookies: Cookies): Promise<AnalyticsTrafficContext> {
	const testToken = env.ANALYTICS_TEST_TOKEN?.trim();
	const marker=request.headers.get('x-analytics-test-marker');
 if(marker){
  if(hasTrustedAnalyticsTestMarker(marker,testToken,request,Date.now(),dev ? new URL(request.url).origin : SITE_ORIGIN))return 'test';
  throw error(400,'Invalid or expired analytics test marker');
 }
	const supabase = createSupabaseServerClient(cookies);
	const { data: { user } } = await supabase.auth.getUser();
	return user && isAllowedAdmin(user.email) ? 'operator' : 'audience';
}
