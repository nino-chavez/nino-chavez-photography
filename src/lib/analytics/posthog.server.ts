import { PostHog } from 'posthog-node';
import { isPostHogProductionRuntime } from './posthog-contract';
import type { PostHogCaptureClient, PostHogFlagClient } from './posthog.types';
export { POSTHOG_PROPERTY_ALLOWLIST, scrubPostHogProperties } from './posthog-contract';

export interface PostHogRuntimeConfig {
	projectApiKey: string;
	host: string;
}

export function postHogRuntimeConfig(source: Record<string, string | undefined>): PostHogRuntimeConfig | null {
	if (!isPostHogProductionRuntime(source)) return null;
	const projectApiKey = source.POSTHOG_PROJECT_API_KEY?.trim();
	const host = source.POSTHOG_HOST?.trim();
	if (!projectApiKey || !host) return null;
	try {
		const parsed = new URL(host);
		if (parsed.protocol !== 'https:') return null;
		return { projectApiKey, host: parsed.origin };
	} catch {
		return null;
	}
}

/** Official SDK wrapper, configured for Cloudflare's short-lived Worker lifecycle. */
export function createPostHogCaptureClient(config: PostHogRuntimeConfig | null): PostHogCaptureClient | null {
	if (!config) return null;
	const client = new PostHog(config.projectApiKey, {
		host: config.host,
		flushAt: 1,
		flushInterval: 0,
		disableGeoip: true,
		enableLocalEvaluation: false,
		fetchRetryCount: 0,
		requestTimeout: 5_000
	});
	return {
		async capture(event) {
			await client.captureImmediate({
				distinctId: event.distinctId,
				event: event.event,
				timestamp: event.timestamp,
				uuid: event.uuid,
				properties: event.properties
			});
		}
	};
}

export interface ExperimentEvaluation {
	available: boolean;
	variant: string | null;
	reason: 'evaluated' | 'disabled' | 'quota_or_provider_unavailable' | 'invalid_assignment';
}

/** A flag outage or quota response defaults safely off and never creates an exposure. */
export async function evaluatePhotographyExperiment(
	client: PostHogFlagClient | null,
	experimentKey: string,
	anonymousBrowserId: string | null
): Promise<ExperimentEvaluation> {
	if (!client || !anonymousBrowserId || !/^[A-Za-z0-9_-]{1,128}$/.test(experimentKey)) {
		return { available: false, variant: null, reason: 'disabled' };
	}
	try {
		const value = await client.getFeatureFlag(experimentKey, anonymousBrowserId, {
			disableGeoip: true,
			sendFeatureFlagEvents: false
		});
		if (typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value)) return { available: true, variant: value, reason: 'evaluated' };
		if (value === true) return { available: true, variant: 'true', reason: 'evaluated' };
		return { available: false, variant: null, reason: 'disabled' };
	} catch {
		return { available: false, variant: null, reason: 'quota_or_provider_unavailable' };
	}
}
