#!/usr/bin/env node

/**
 * Installs only the fixed, private photography dashboard definitions. It never
 * creates an organization/project, enables billing, or activates an experiment.
 * Dry run is the default so reviewing this script cannot mutate PostHog.
 */

const apply = process.argv.includes('--apply');
const selectedProject = argument('--project');
const host = process.env.POSTHOG_HOST?.replace(/\/$/, '');
const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;
const configuredProject = process.env.POSTHOG_PROJECT_ID;

const dashboards = [
	{
		name: 'Photography: journeys and reliability',
		description: 'Version-2, eligible-audience journey measures. Provider delivery is not collection truth; compare with first-party reconciliation.'
	},
	{
		name: 'Photography: distribution and experiments',
		description: 'Tagged arrivals, measured return, and observed experiment exposure. No experiment is activated by this setup.'
	}
];

const insights = [
	{ dashboard: dashboards[0].name, name: 'Discovery: exposed album to open', report: 'discovery' },
	{ dashboard: dashboards[0].name, name: 'Album use: open to photo action', report: 'album_use' },
	{ dashboard: dashboards[0].name, name: 'Search usefulness', report: 'search_usefulness' },
	{ dashboard: dashboards[0].name, name: 'Download reliability', report: 'download_reliability' },
	{ dashboard: dashboards[0].name, name: 'Photograph response', report: 'photo_response' },
	{ dashboard: dashboards[1].name, name: 'Distribution and return', report: 'sources_return' },
	{ dashboard: dashboards[1].name, name: 'Experiment exposure and guardrails', report: 'experiments' }
];

function argument(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function fail(message) {
	console.error(`PostHog setup not run: ${message}`);
	process.exitCode = 1;
}

function describe() {
	console.log(JSON.stringify({
		mode: apply ? 'apply requested' : 'dry run',
		project: selectedProject ?? '(must be supplied for apply)',
		creates: { organizations: 0, projects: 0, billingChanges: 0, experimentActivations: 0 },
		dashboards: dashboards.map((dashboard) => dashboard.name),
		insights: insights.map((insight) => insight.name),
		guard: 'Existing dashboard/insight names are reused. A project mismatch stops before a write.'
	}, null, 2));
}

async function request(path, options = {}) {
	const response = await fetch(`${host}${path}`, {
		...options,
		headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json', ...(options.headers ?? {}) }
	});
	if (!response.ok) throw new Error(`${options.method ?? 'GET'} ${path} returned ${response.status}`);
	return response.json();
}

function fixedInsightPayload(insight, dashboardId) {
	return {
		name: insight.name,
		description: `Photography version-2 fixed ${insight.report} report. Edit the source-controlled query module, not this insight, when definitions change.`,
		dashboard: dashboardId,
		// These are fixed aggregate specs for saved private insights. The gallery's
		// server query module remains the public-data authority.
		query: { kind: 'HogQLQuery', query: insightQuery(insight.report) }
	};
}

function insightQuery(report) {
	const scoped = "WITH scoped AS (SELECT event, properties.visit_id AS visit_id, properties.album_key AS album_key, properties.photo_id AS photo_id, properties.search_id AS search_id, properties.download_request_id AS download_request_id, distinct_id AS browser_id, properties.result_count AS result_count FROM events WHERE toString(properties.schema_version) = '2' AND properties.traffic_context = 'audience' AND properties.visit_id != '' AND timestamp >= now() - INTERVAL 30 DAY)";
	const reports = {
		discovery: "SELECT uniqExactIf(visit_id, event = 'album_exposed') AS album_exposed_visits, uniqExactIf(visit_id, event = 'album_opened' AND (visit_id, album_key) IN (SELECT visit_id, album_key FROM scoped WHERE event = 'album_exposed')) AS album_opened_after_exposure FROM scoped",
		album_use: "SELECT uniqExactIf(visit_id, event = 'album_opened') AS album_open_visits, uniqExactIf(visit_id, event = 'photo_rendered' AND (visit_id, album_key) IN (SELECT visit_id, album_key FROM scoped WHERE event = 'album_opened')) AS photo_render_visits, uniqExactIf(visit_id, event IN ('favorite_added', 'download_requested') AND (visit_id, album_key) IN (SELECT visit_id, album_key FROM scoped WHERE event = 'photo_rendered')) AS album_action_visits FROM scoped",
		search_usefulness: "SELECT countIf(event = 'search_results_shown') AS searches_shown, countIf(event = 'search_results_shown' AND toInt64OrZero(result_count) = 0) AS zero_result_searches, countIf(event = 'search_result_selected' AND (visit_id, search_id) IN (SELECT visit_id, search_id FROM scoped WHERE event = 'search_results_shown')) AS selected_searches FROM scoped",
		download_reliability: "SELECT uniqExactIf(download_request_id, event = 'download_requested') AS requests, uniqExactIf(download_request_id, event = 'download_prepared') AS prepared, uniqExactIf(download_request_id, event = 'download_handed_off') AS handed_off, uniqExactIf(download_request_id, event = 'download_failed') AS failed FROM scoped",
		photo_response: "SELECT uniqExactIf(concat(visit_id, ':', photo_id), event = 'photo_exposed') AS eligible_photo_exposures, uniqExactIf(concat(visit_id, ':', photo_id), event IN ('photo_opened', 'favorite_added', 'download_requested') AND (visit_id, photo_id) IN (SELECT visit_id, photo_id FROM scoped WHERE event = 'photo_exposed')) AS later_photo_actions FROM scoped",
		sources_return: "SELECT uniqExactIf(browser_id, browser_id IN (SELECT browser_id FROM scoped GROUP BY browser_id HAVING uniqExact(visit_id) > 1)) AS returning_measured_browsers, uniqExactIf(visit_id, event IN ('album_opened', 'photo_opened', 'favorite_added', 'download_requested')) AS tagged_arrival_action_visits FROM scoped",
		experiments: "SELECT uniqExactIf(concat(visit_id, ':', properties.experiment_key, ':', properties.variant), event = 'experiment_exposed') AS observed_exposures, uniqExactIf(visit_id, event IN ('photo_load_failed', 'download_failed') AND visit_id IN (SELECT visit_id FROM scoped WHERE event = 'experiment_exposed')) AS guardrail_failures FROM scoped"
	};
	return `${scoped} ${reports[report]}`;
}

async function ensureDashboard(dashboard) {
	const list = await request(`/api/projects/${selectedProject}/dashboards/`);
	const existing = (list.results ?? []).find((entry) => entry?.name === dashboard.name);
	if (existing?.id) return existing;
	return request(`/api/projects/${selectedProject}/dashboards/`, { method: 'POST', body: JSON.stringify(dashboard) });
}

async function ensureInsight(insight, dashboardId) {
	const list = await request(`/api/projects/${selectedProject}/insights/?search=${encodeURIComponent(insight.name)}`);
	const existing = (list.results ?? []).find((entry) => entry?.name === insight.name && Number(entry.dashboard) === Number(dashboardId));
	if (existing?.id) return existing;
	return request(`/api/projects/${selectedProject}/insights/`, { method: 'POST', body: JSON.stringify(fixedInsightPayload(insight, dashboardId)) });
}

describe();
if (!apply) {
	console.log('No network call was made. Add --apply only after the runbook gates are complete.');
	process.exit(0);
}

if (!selectedProject || !/^\d+$/.test(selectedProject)) fail('pass the numeric target with --project <id>.');
else if (!host?.startsWith('https://')) fail('POSTHOG_HOST must be an https origin.');
else if (!apiKey) fail('POSTHOG_PERSONAL_API_KEY is required for --apply.');
else if (!configuredProject || configuredProject !== selectedProject) fail('POSTHOG_PROJECT_ID must exactly match --project.');
else if (process.env.POSTHOG_SETUP_CONFIRM !== 'photography-posthog-setup') fail('set POSTHOG_SETUP_CONFIRM=photography-posthog-setup for --apply.');
else {
	try {
		const createdDashboards = new Map();
		for (const dashboard of dashboards) createdDashboards.set(dashboard.name, await ensureDashboard(dashboard));
		for (const insight of insights) await ensureInsight(insight, createdDashboards.get(insight.dashboard).id);
		console.log(`Installed or reused ${dashboards.length} dashboards and ${insights.length} fixed insights in project ${selectedProject}.`);
	} catch (error) {
		fail(error instanceof Error ? error.message : 'unknown provider error');
	}
}
