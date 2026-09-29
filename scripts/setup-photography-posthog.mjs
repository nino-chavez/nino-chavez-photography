#!/usr/bin/env -S node --import tsx

import { buildPostHogDashboardQuery } from '../src/lib/analytics/posthog-queries.server.ts';

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
const visibleAlbumKeys = argumentsFor('--album-key');

const dashboards = [
	{
		name: 'Photography: journeys and reliability',
		description: 'Version-2, eligible-audience journey measures. Provider delivery is not collection truth; compare with first-party reconciliation.'
	},
	{
		name: 'Photography: distribution and experiments',
		description: 'Measured browser return and observed experiment exposure. Tagged-source reporting remains unavailable until the collector supports it. No experiment is activated by this setup.'
	}
];

const insights = [
	{ dashboard: dashboards[0].name, name: 'Discovery: exposed album to open', legacyNames: [], report: 'discovery' },
	{ dashboard: dashboards[0].name, name: 'Album use: open to photo action', legacyNames: [], report: 'album_use' },
	{ dashboard: dashboards[0].name, name: 'Search usefulness', legacyNames: [], report: 'search_usefulness' },
	{ dashboard: dashboards[0].name, name: 'Download reliability', legacyNames: [], report: 'download_reliability' },
	{ dashboard: dashboards[0].name, name: 'Photograph response', legacyNames: [], report: 'photo_response' },
	{ dashboard: dashboards[1].name, name: 'Measured return within browser coverage', legacyNames: ['Distribution and return'], report: 'sources_return' },
	{ dashboard: dashboards[1].name, name: 'Experiment exposure and guardrails', legacyNames: [], report: 'experiments' }
];

function argument(name) {
	const index = process.argv.indexOf(name);
	return index === -1 ? undefined : process.argv[index + 1];
}

function argumentsFor(name) {
	return process.argv.flatMap((value, index) => value === name && process.argv[index + 1] ? [process.argv[index + 1]] : []);
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
		visibleAlbumCount: visibleAlbumKeys.length,
		guard: 'Existing dashboards are reused and fixed insights are updated. A project mismatch or missing visibility scope stops before a write.'
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
	const query = buildPostHogDashboardQuery(insight.report, visibleAlbumKeys);
	if (!query) throw new Error(`could not build the fixed ${insight.report} query`);
	return {
		name: insight.name,
		description: `Photography version-2 fixed ${insight.report} report. Edit the source-controlled query module, not this insight, when definitions change.`,
		dashboard: dashboardId,
		query
	};
}

async function ensureDashboard(dashboard) {
	const list = await request(`/api/projects/${selectedProject}/dashboards/`);
	const existing = (list.results ?? []).find((entry) => entry?.name === dashboard.name);
	if (existing?.id) return existing;
	return request(`/api/projects/${selectedProject}/dashboards/`, { method: 'POST', body: JSON.stringify(dashboard) });
}

async function ensureInsight(insight, dashboardId) {
	const names = [insight.name, ...(insight.legacyNames ?? [])];
	let existing;
	for (const name of names) {
		const list = await request(`/api/projects/${selectedProject}/insights/?search=${encodeURIComponent(name)}`);
		existing = (list.results ?? []).find((entry) => names.includes(entry?.name) && Number(entry.dashboard) === Number(dashboardId));
		if (existing) break;
	}
	const payload = fixedInsightPayload(insight, dashboardId);
	if (existing?.id) return request(`/api/projects/${selectedProject}/insights/${existing.id}/`, { method: 'PATCH', body: JSON.stringify(payload) });
	return request(`/api/projects/${selectedProject}/insights/`, { method: 'POST', body: JSON.stringify(payload) });
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
else if (visibleAlbumKeys.length === 0) fail('pass each current public album with --album-key <key>.');
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
