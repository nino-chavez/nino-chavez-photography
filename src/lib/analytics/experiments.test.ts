import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { compile } from 'svelte/compiler';
import { createExperimentExposureEmitter } from './experiment-exposure';
import { hasAlbumCardCta } from './experiments';
import { assignPhotographyExperiment, photographyExperimentConfiguration } from './experiments.server';

const configuredEnvironment = {
	PHOTOGRAPHY_EXPERIMENTS_ENABLED: 'true',
	PHOTOGRAPHY_EXPERIMENT_QUOTA_OK: 'true',
	PHOTOGRAPHY_EXPERIMENT_KEY: 'album-card-discovery',
	PHOTOGRAPHY_EXPERIMENT_VARIANTS: 'control,album_card_cta'
};

test('experiment configuration is disabled until every explicit release gate is set', () => {
	assert.equal(photographyExperimentConfiguration({}), null);
	assert.equal(photographyExperimentConfiguration({ ...configuredEnvironment, PHOTOGRAPHY_EXPERIMENT_QUOTA_OK: 'false' }), null);
	assert.equal(photographyExperimentConfiguration({ ...configuredEnvironment, PHOTOGRAPHY_EXPERIMENT_VARIANTS: 'control,unexpected' }), null);
	assert.equal(photographyExperimentConfiguration({ ...configuredEnvironment, PHOTOGRAPHY_EXPERIMENT_VARIANTS: 'control' }), null);
});

test('assignment requires audience consent and the server-verified browser binding', async () => {
	const configuration = photographyExperimentConfiguration(configuredEnvironment);
	let flagCalls = 0;
	const flagClient = { getFeatureFlag: async () => { flagCalls += 1; return 'album_card_cta'; } };
	for (const input of [
		{ trafficContext: 'operator' as const, hasLinkedConsent: true, verifiedBrowserId: 'browser-1' },
		{ trafficContext: 'test' as const, hasLinkedConsent: true, verifiedBrowserId: 'browser-1' },
		{ trafficContext: 'self_excluded' as const, hasLinkedConsent: true, verifiedBrowserId: 'browser-1' },
		{ trafficContext: 'audience' as const, hasLinkedConsent: false, verifiedBrowserId: 'browser-1' },
		{ trafficContext: 'audience' as const, hasLinkedConsent: true, verifiedBrowserId: null }
	]) {
		const result = await assignPhotographyExperiment({ configuration, release: 'commit_abc1234', flagClient, ...input });
		assert.equal(result.assignment, null);
	}
	assert.equal(flagCalls, 0);
});

test('provider failure and unsupported values preserve the control presentation without an assignment', async () => {
	const configuration = photographyExperimentConfiguration(configuredEnvironment);
	const common = { configuration, trafficContext: 'audience' as const, hasLinkedConsent: true, verifiedBrowserId: 'browser-1', release: 'commit_abc1234' };
	assert.deepEqual(await assignPhotographyExperiment({ ...common, flagClient: null }), { assignment: null, reason: 'disabled' });
	assert.deepEqual(await assignPhotographyExperiment({ ...common, flagClient: { getFeatureFlag: async () => { throw new Error('quota'); } } }), { assignment: null, reason: 'provider_unavailable' });
	assert.deepEqual(await assignPhotographyExperiment({ ...common, flagClient: { getFeatureFlag: async () => 'unapproved' } }), { assignment: null, reason: 'invalid_assignment' });
});

test('the configured treatment reaches the album-card presentation and the client emits one visible exposure', async () => {
	const configuration = photographyExperimentConfiguration(configuredEnvironment);
	const result = await assignPhotographyExperiment({
		configuration, trafficContext: 'audience', hasLinkedConsent: true, verifiedBrowserId: 'browser-1', release: 'commit_abc1234',
		flagClient: { getFeatureFlag: async () => 'album_card_cta' }
	});
	assert.deepEqual(result.assignment, { key: 'album-card-discovery', variant: 'album_card_cta', release: 'commit_abc1234' });
	assert.equal(hasAlbumCardCta(result.assignment), true);
	const events: Array<{ eventName: 'experiment_exposed'; properties: { experiment_key: string; variant: string; surface: string; release: string } }> = [];
	const emit = createExperimentExposureEmitter((event) => events.push(event));
	emit(result.assignment, 'albums_album_card');
	emit(result.assignment, 'albums_album_card');
	assert.deepEqual(events, [{ eventName: 'experiment_exposed', properties: {
		experiment_key: 'album-card-discovery', variant: 'album_card_cta', release: 'commit_abc1234', surface: 'albums_album_card'
	} }]);
	const albumPage = readFileSync('src/routes/albums/+page.svelte', 'utf8');
	const albumCard = readFileSync('src/lib/components/gallery/AlbumCard.svelte', 'utf8');
	assert.doesNotThrow(() => compile(albumPage, { generate: 'client', filename: 'src/routes/albums/+page.svelte' }));
	assert.doesNotThrow(() => compile(albumCard, { generate: 'client', filename: 'src/lib/components/gallery/AlbumCard.svelte' }));
	assert.match(albumPage, /experiment=\{index === 0 \? data\.experiment : null\}/);
	assert.match(albumCard, /hasAlbumCardCta\(experiment\)/);
	assert.match(albumCard, /View event/);
});
