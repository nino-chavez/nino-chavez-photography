import { error, redirect } from '@sveltejs/kit';
import { base } from '$app/paths';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/supabase/server-ssr';
import { isAllowedAdmin } from '$lib/server/admin-auth';
import { buildOperatorReport, reportCsv } from '$lib/analytics/operator-report.server';
import { parseReportQuery } from '$lib/analytics/report-contract';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies, url, setHeaders }) => {
	setHeaders({
		'cache-control': 'private, no-store, max-age=0',
		'pragma': 'no-cache',
		'x-robots-tag': 'noindex, nofollow, noarchive'
	});
	const { data: { user } } = await createSupabaseServerClient(cookies).auth.getUser();
	if (!user) throw redirect(302, `${base}/login`);
	if (!isAllowedAdmin(user.email)) throw error(403, 'Operator access required');
	const report = await buildOperatorReport(createSupabaseAdminClient(), parseReportQuery(url.searchParams));
	if (!report.available) throw error(503, report.error ?? 'Analytics report unavailable');
	const shortlist = url.searchParams.has('shortlist')
		? new Set((url.searchParams.get('shortlist') ?? '').split(',').filter(Boolean))
		: undefined;
	return new Response(reportCsv(report, shortlist), {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			'content-disposition': `attachment; filename="gallery-analytics-${report.query.start}-to-${report.query.end}.csv"`,
			'cache-control': 'private, no-store, max-age=0',
			'x-robots-tag': 'noindex, nofollow, noarchive'
		}
	});
};
