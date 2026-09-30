import assert from 'node:assert/strict';
import test from 'node:test';
import { BoundedSingleFlightCache } from './bounded-singleflight-cache.server';

test('coalesces identical work, expires it, and never caches failures', async () => {
	let now = 0;
	let calls = 0;
	const cache = new BoundedSingleFlightCache<number>({ ttlMs: 10, maxEntries: 2, maxBytes: 100, now: () => now });
	const load = async () => ++calls;
	assert.deepEqual(await Promise.all([cache.get('same', load), cache.get('same', load)]), [1, 1]);
	assert.equal(await cache.get('same', load), 1);
	now = 11;
	assert.equal(await cache.get('same', load), 2);
	await assert.rejects(cache.get('failure', async () => { throw new Error('no result'); }), /no result/);
	assert.equal(await cache.get('failure', load), 3);
});

test('bounds entries and bytes instead of retaining an unbounded snapshot set', async () => {
	let calls = 0;
	const cache = new BoundedSingleFlightCache<string>({ ttlMs: 100, maxEntries: 1, maxBytes: 20 });
	await cache.get('a', async () => `a-${++calls}`);
	await cache.get('b', async () => `b-${++calls}`);
	assert.equal(await cache.get('a', async () => `a-${++calls}`), 'a-3');
	assert.equal((await cache.get('large', async () => 'x'.repeat(30))).length, 30);
	await cache.get('large', async () => `small-${++calls}`);
	assert.equal(calls, 4);
});


test('bounds concurrent expensive reads while identical requests share one flight', async () => {
 const cache = new BoundedSingleFlightCache<number>({ttlMs:100,maxEntries:2,maxBytes:100,maxInFlight:1});
 let release!: (value:number)=>void;
 const pending=cache.get('one',()=>new Promise<number>(resolve=>{release=resolve}));
 const same=cache.get('one',()=>Promise.resolve(99));
 await assert.rejects(cache.get('two',()=>Promise.resolve(2)),/capacity/);
 release(1);
 assert.deepEqual(await Promise.all([pending,same]),[1,1]);
 assert.equal(await cache.get('two',()=>Promise.resolve(2)),2);
});
