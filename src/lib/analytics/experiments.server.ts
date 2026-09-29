import {
	isPhotographyExperimentVariant,
	type PhotographyExperimentAssignment,
	type PhotographyExperimentVariant
} from './experiments';
import { evaluatePhotographyExperiment } from './posthog.server';
import type { PostHogFlagClient } from './posthog.types';

const EXPERIMENT_KEY = /^[A-Za-z0-9_-]{1,80}$/;

export interface PhotographyExperimentConfiguration {
	key: string;
	variants: readonly PhotographyExperimentVariant[];
}

export type PhotographyExperimentReason =
	| 'disabled'
	| 'ineligible_context'
	| 'missing_consent_or_binding'
	| 'provider_unavailable'
	| 'invalid_assignment'
	| 'assigned';

export interface PhotographyExperimentResult {
	assignment: PhotographyExperimentAssignment | null;
	reason: PhotographyExperimentReason;
}

/**
 * Experiments have a separate, exact opt-in from provider delivery. The quota
 * acknowledgement is deliberately a manual release gate: an unset or stale
 * acknowledgement fails closed instead of sampling visitors after a cap.
 */
export function photographyExperimentConfiguration(
	source: Record<string, string | undefined>
): PhotographyExperimentConfiguration | null {
	if (source.PHOTOGRAPHY_EXPERIMENTS_ENABLED !== 'true' || source.PHOTOGRAPHY_EXPERIMENT_QUOTA_OK !== 'true') return null;
	const key = source.PHOTOGRAPHY_EXPERIMENT_KEY?.trim() ?? '';
	if (!EXPERIMENT_KEY.test(key)) return null;
	const variants = (source.PHOTOGRAPHY_EXPERIMENT_VARIANTS ?? '').split(',').map((value) => value.trim());
	if (variants.length !== 2 || new Set(variants).size !== 2 || !variants.every(isPhotographyExperimentVariant)) return null;
	return { key, variants: variants as PhotographyExperimentVariant[] };
}

/**
 * Assignment is evaluated once in the route loader. The provider never sees an
 * email or browser value that was merely posted by the client: callers pass the
 * same signed binding the collection endpoint accepts.
 */
export async function assignPhotographyExperiment(input: {
	configuration: PhotographyExperimentConfiguration | null;
	trafficContext: 'audience' | 'operator' | 'test' | 'self_excluded';
	hasLinkedConsent: boolean;
	verifiedBrowserId: string | null;
	release: string;
	flagClient: PostHogFlagClient | null;
}): Promise<PhotographyExperimentResult> {
	if (!input.configuration) return { assignment: null, reason: 'disabled' };
	if (input.trafficContext !== 'audience') return { assignment: null, reason: 'ineligible_context' };
	if (!input.hasLinkedConsent || !input.verifiedBrowserId) return { assignment: null, reason: 'missing_consent_or_binding' };

	const evaluation = await evaluatePhotographyExperiment(input.flagClient, input.configuration.key, input.verifiedBrowserId);
	if (!evaluation.available) {
		return { assignment: null, reason: evaluation.reason === 'quota_or_provider_unavailable' ? 'provider_unavailable' : 'disabled' };
	}
	if (!evaluation.variant || !input.configuration.variants.includes(evaluation.variant as PhotographyExperimentVariant)) {
		return { assignment: null, reason: 'invalid_assignment' };
	}
	return {
		assignment: { key: input.configuration.key, variant: evaluation.variant as PhotographyExperimentVariant, release: input.release },
		reason: 'assigned'
	};
}
