import assert from 'node:assert/strict';
import test from 'node:test';
import type { Photo } from '$types/photo';
import {
	MAX_SAVED,
	STORAGE_KEY,
	createSavedPhotos,
	parseImport,
	readSaved,
	serializeSaved,
	type SavedPhotosStorage
} from './saved-photos';

// Invented photos. A and B are two different photos whose camera frame names collide, as the
// 113 real pairs measured on 2026-07-28 do (resolve-photo-by-key.ts).
const photo = (id: string, image_key: string, album_key: string) =>
	({ id, image_key, album_key, image_url: `https://example.invalid/${id}.jpg` }) as Photo;
const A = photo('photo-a', 'DSC05553', 'ALBUMA');
const B = photo('photo-b', 'DSC05553', 'ALBUMB');
const C = photo('photo-c', 'DSC00001', 'ALBUMC');

/** One browser's localStorage, shared by every tab built on it. */
function browserStorage(): SavedPhotosStorage & { refuseWrites: boolean; raw(): string | null } {
	const items = new Map<string, string>();
	return {
		refuseWrites: false,
		getItem: (key) => items.get(key) ?? null,
		setItem(key, value) {
			if (this.refuseWrites) throw new Error('QuotaExceededError');
			items.set(key, value);
		},
		raw: () => items.get(STORAGE_KEY) ?? null
	};
}
const ids = (saved: ReadonlyMap<string, Photo>) => [...saved.keys()];

test('two different photos that share a frame name are saved and removed independently (#255)', () => {
	const tab = createSavedPhotos(browserStorage());
	assert.equal(tab.add(A).outcome, 'added');
	assert.equal(tab.read().has(B.id), false, 'saving A must not mark B saved');
	assert.equal(tab.add(B).outcome, 'added');
	assert.deepEqual(ids(tab.read()), ['photo-a', 'photo-b']);

	const removed = tab.remove(B.id);
	assert.equal(removed.outcome, 'removed');
	assert.equal(removed.photo?.id, 'photo-b', 'removal returns the photo that was tapped');
	assert.deepEqual(ids(tab.read()), ['photo-a'], 'removing B keeps A');
});

test('Undo restores the removed photo even when its twin was saved meanwhile (#255)', () => {
	const tab = createSavedPhotos(browserStorage());
	tab.add(A);
	const { photo: removed } = tab.remove(A.id);
	tab.add(B);
	assert.equal(tab.add(removed!).outcome, 'added');
	assert.deepEqual(ids(tab.read()), ['photo-b', 'photo-a']);
});

test('a save in one tab survives a save in another tab opened earlier (#256)', () => {
	const storage = browserStorage();
	const tab1 = createSavedPhotos(storage);
	const tab2 = createSavedPhotos(storage);
	tab1.read();
	tab2.read(); // both tabs loaded the empty list
	tab1.add(A);
	tab2.add(C);
	assert.deepEqual(ids(readSaved(storage.raw())), ['photo-a', 'photo-c']);
	tab1.remove(C.id);
	assert.deepEqual(ids(readSaved(storage.raw())), ['photo-a'], 'a removal in tab 1 sees tab 2s save');
});

test('a refused write changes nothing and is reported (#257)', () => {
	const storage = browserStorage();
	const tab = createSavedPhotos(storage);
	tab.add(C);
	storage.refuseWrites = true;
	assert.equal(tab.add(A).outcome, 'write_failed');
	assert.equal(tab.replace(parseImport(JSON.stringify({ photos: [A, B] }))).ok, false);
	assert.equal(tab.remove(C.id).outcome, 'write_failed');
	storage.refuseWrites = false;
	assert.deepEqual(ids(tab.read()), ['photo-c']);
});

test('an import file with a bad entry keeps the good ones and leaves the list alone until written (#257)', () => {
	const kept = parseImport(JSON.stringify({ photos: [A, null, { id: 'no-key' }, 'text', C, A] }));
	assert.deepEqual(ids(kept), ['photo-a', 'photo-c'], 'invalid entries and the repeated A are skipped');
	assert.throws(() => parseImport(JSON.stringify({ photos: [null, { image_key: 'DSC1' }] })), /No photos in this file/);
	assert.throws(() => parseImport('not json'), /Invalid import format/);
	assert.throws(() => parseImport(JSON.stringify({ photos: 'x' })), /Invalid import format/);
	assert.equal(parseImport(JSON.stringify({ photos: [] })).size, 0, 'an empty export imports as an empty list');
});

test('import keeps at most the saved-photo limit', () => {
	const many = Array.from({ length: MAX_SAVED + 5 }, (_, i) => photo(`p${i}`, `K${i}`, 'ALB'));
	assert.equal(parseImport(JSON.stringify({ photos: many })).size, MAX_SAVED);
});

test('a full list refuses a new save', () => {
	const tab = createSavedPhotos(browserStorage());
	for (let i = 0; i < MAX_SAVED; i++) tab.add(photo(`p${i}`, `K${i}`, 'ALB'));
	assert.equal(tab.add(A).outcome, 'limit');
	assert.equal(tab.read().size, MAX_SAVED);
});

test('lists stored by earlier versions load by photo id, and ids with no record are dropped', () => {
	// Earlier versions stored photoIds as image_keys beside the records. DSC09999 has no record:
	// it used to count as saved and could never be removed.
	const old = JSON.stringify({ photoIds: ['DSC00001', 'DSC09999'], photos: [C, { id: 'photo-n' }] });
	const saved = readSaved(old);
	assert.deepEqual(ids(saved), ['photo-c']);
	assert.equal(readSaved('{broken').size, 0);
	assert.deepEqual(ids(readSaved(serializeSaved(saved))), ['photo-c'], 'round trip');
});

test('without browser storage the list lives in memory', () => {
	const tab = createSavedPhotos(null);
	tab.add(A);
	tab.add(B);
	assert.deepEqual(ids(tab.read()), ['photo-a', 'photo-b']);
});
