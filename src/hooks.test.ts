import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reroute } from './hooks';

const rerouted = (url: string) => reroute({ url: new URL(url), fetch } as Parameters<typeof reroute>[0]);

test('every clean report address on the report host is placed under the app base, where routing can find it', () => {
	assert.equal(rerouted('https://analytics.ninochavez.co/'), '/photography/analytics/home');
	assert.equal(rerouted('https://analytics.ninochavez.co/photos'), '/photography/analytics/photos');
	assert.equal(rerouted('https://analytics.ninochavez.co/photos/export.csv'), '/photography/analytics/photos/export.csv');
	assert.equal(rerouted('https://analytics.ninochavez.co/albums/Re7kho'), '/photography/analytics/albums/Re7kho');
});

test('the old gallery report addresses are placed under the base too, so the redirect in handle is reached', () => {
	// Outside the base, SvelteKit answers 404 before handle runs: the redirect would never fire.
	assert.equal(rerouted('https://analytics.ninochavez.co/gallery?section=photos'), '/photography/analytics/operator');
	assert.equal(rerouted('https://analytics.ninochavez.co/gallery/export.csv?period=7'), '/photography/analytics/operator/export.csv');
});

test('nothing else is rerouted, and nothing is on another host', () => {
	assert.equal(rerouted('https://analytics.ninochavez.co/gallery/other'), undefined);
	assert.equal(rerouted('https://analytics.ninochavez.co/nonsense'), undefined);
	assert.equal(rerouted('https://ninochavez.co/gallery'), undefined);
	assert.equal(rerouted('http://127.0.0.1:5189/gallery'), undefined);
});
