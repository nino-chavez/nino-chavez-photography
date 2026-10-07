import assert from 'node:assert/strict';
import test from 'node:test';
import { readShortlist, SHORTLIST_KEY, SHORTLIST_LIMIT, signInNeeds, writeShortlist } from './shortlist';

const store = (initial?: string) => {
	const items = new Map<string, string>(initial === undefined ? [] : [[SHORTLIST_KEY, initial]]);
	return { getItem: (key: string) => items.get(key) ?? null, setItem: (key: string, value: string) => { items.set(key, value); }, items };
};

test('a shortlist written on one page is read on the other, under one key', () => {
	const storage = store();
	writeShortlist(['a', 'b'], storage);
	assert.deepEqual(readShortlist(storage), ['a', 'b']);
	assert.equal(storage.items.has(SHORTLIST_KEY), true);
});

test('a missing, damaged or foreign store is an empty shortlist, and only text ids are kept', () => {
	assert.deepEqual(readShortlist(store()), []);
	assert.deepEqual(readShortlist(store('not json')), []);
	assert.deepEqual(readShortlist(store('{"a":1}')), []);
	assert.deepEqual(readShortlist(store('["a",1,null,"b"]')), ['a', 'b']);
	assert.deepEqual(readShortlist(null), []);
	assert.deepEqual(readShortlist({ getItem: () => { throw new Error('blocked'); } }), []);
});

test('the shortlist is bounded when read and when written, and a refusing browser is not an error', () => {
	const many = Array.from({ length: SHORTLIST_LIMIT + 20 }, (_, i) => `p${i}`);
	const storage = store();
	writeShortlist(many, storage);
	assert.equal(readShortlist(storage).length, SHORTLIST_LIMIT);
	assert.equal(readShortlist(store(JSON.stringify(many))).length, SHORTLIST_LIMIT);
	assert.doesNotThrow(() => writeShortlist(['a'], { setItem: () => { throw new Error('full'); } }));
	assert.doesNotThrow(() => writeShortlist(['a'], null));
});

test('what signing in adds is said in one sentence start', () => {
	assert.equal(signInNeeds(['shortlisting', 'saved views']), 'Shortlisting and saved views need');
	assert.equal(signInNeeds(['shortlisting', 'recording what you did', 'private sharing notes']), 'Shortlisting, recording what you did and private sharing notes need');
});
