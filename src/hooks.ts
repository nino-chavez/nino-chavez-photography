import type { Reroute } from '@sveltejs/kit';
import { oldAddressReroute } from '$lib/analytics/old-addresses';
import { internalReportPath, isReportHost } from '$lib/analytics/report-paths';

// SvelteKit resolves the report route without changing its public URL.
export const reroute: Reroute = ({ url }) => {
	if (isReportHost(url.hostname)) return internalReportPath(url.pathname) ?? oldAddressReroute(url.pathname) ?? undefined;
};
