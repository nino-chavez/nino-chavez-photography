import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCaptionContract, captionWordCount, inspectCaption } from './caption-contract';

test('accepts a short visible-facts caption', () => {
	const caption = 'A player in a red jersey, number 12, dives near the sideline while two teammates watch.';
	assert.equal(captionWordCount(caption), 16);
	assert.deepEqual(inspectCaption(caption), []);
	assert.doesNotThrow(() => assertCaptionContract(caption));
});

test('rejects inferred relationship, emotion, outcome, and aesthetic claims', () => {
	assert.deepEqual(
		inspectCaption('Two happy friends celebrate a stunning championship-winning score.').map((issue) => issue.code),
		['relationship-claim', 'emotion-claim', 'outcome-claim', 'aesthetic-claim']
	);
});

test('rejects captions over 30 words', () => {
	const caption = Array.from({ length: 31 }, (_, index) => `word${index + 1}`).join(' ');
	assert.equal(inspectCaption(caption)[0]?.code, 'too-long');
});
