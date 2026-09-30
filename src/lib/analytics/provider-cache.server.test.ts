import assert from 'node:assert/strict';
import test from 'node:test';
import { createProviderCache, credentialIdentity, ProviderCacheCapacityError } from './provider-cache.server';

test('identical concurrent reads share one provider call and expire at the TTL', async () => {
	let now = 1_000;
	let calls = 0;
	let release!: (value: { total: number }) => void;
	const cache = createProviderCache({ ttlMs: 100, maxEntries: 4, maxInFlight: 2, maxBytes: 1_000, now: () => now });
	const load = () => {
		calls += 1;
		return new Promise<{ total: number }>((resolve) => { release = resolve; });
	};
	const first = cache.getOrLoad({ provider: 'test', filter: { end: '2026-09-29', start: '2026-09-01' } }, load);
	const second = cache.getOrLoad({ filter: { start: '2026-09-01', end: '2026-09-29' }, provider: 'test' }, load);
	assert.equal(calls, 1);
	release({ total: 7 });
	assert.deepEqual(await Promise.all([first, second]), [{ total: 7 }, { total: 7 }]);
	assert.deepEqual(await cache.getOrLoad({ provider: 'test', filter: { start: '2026-09-01', end: '2026-09-29' } }, load), { total: 7 });
	assert.equal(calls, 1);
	now += 101;
	const expired = cache.getOrLoad({ provider: 'test', filter: { start: '2026-09-01', end: '2026-09-29' } }, load);
	assert.equal(calls, 2);
	release({ total: 8 });
	assert.deepEqual(await expired, { total: 8 });
});

test('failures retry, entries and bytes stay bounded, and unique in-flight reads are capped', async () => {
	const cache = createProviderCache({ ttlMs: 100, maxEntries: 2, maxInFlight: 1, maxBytes: 100 });
	let failures = 0;
	await assert.rejects(cache.getOrLoad('failure', async () => { failures += 1; throw new Error('provider failed'); }));
	await assert.rejects(cache.getOrLoad('failure', async () => { failures += 1; throw new Error('provider failed'); }));
	assert.equal(failures, 2);

	let release!: () => void;
	const held = cache.getOrLoad('held', () => new Promise<number>((resolve) => { release = () => resolve(1); }));
	await assert.rejects(cache.getOrLoad('different', async () => 2), ProviderCacheCapacityError);
	release();
	await held;
	await cache.getOrLoad('second', async () => 2);
	await cache.getOrLoad('third', async () => 3);
	assert.equal(cache.stats().entries, 2);
	assert.ok(cache.stats().bytes <= 100);
	await cache.getOrLoad('oversized', async () => 'x'.repeat(200));
	assert.equal(cache.stats().entries, 2);
	await assert.rejects(cache.getOrLoad('x'.repeat(200), async () => 4), ProviderCacheCapacityError);
});

test('credential identities separate secrets without containing them', async () => {
	const first = await credentialIdentity('credential-one');
	const second = await credentialIdentity('credential-two');
	assert.notEqual(first, second);
	assert.equal(first.includes('credential-one'), false);
	assert.match(first, /^[a-f0-9]{64}$/);
});
