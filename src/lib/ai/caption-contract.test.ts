import assert from 'node:assert/strict';
import test from 'node:test';
import {
	assertCaptionContract,
	buildCaptionCorrectionMessage,
	captionWordCount,
	inspectCaption
} from './caption-contract';

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

test('rejects swimwear garment names but keeps ordinary athletic wear', () => {
	assert.deepEqual(
		inspectCaption('A woman in a brown bikini digs a volleyball on a sandy court.').map((issue) => issue.code),
		['swimwear-term']
	);
	assert.deepEqual(inspectCaption('A player in brown digs a volleyball on a sandy court.'), []);
	assert.deepEqual(
		inspectCaption('A player in a black top and red shorts serves on the sand.'),
		[]
	);
	// A sports bra is standard kit on an indoor or grass court, not swimwear.
	assert.deepEqual(
		inspectCaption('A player in a blue sports bra and shorts prepares to serve on a grass court.'),
		[]
	);
});

test('correction message tells the model to keep the color and drop the garment', () => {
	const message = buildCaptionCorrectionMessage(
		inspectCaption('A woman in a brown bikini digs a volleyball on a sandy court.')
	);
	assert.match(message, /"bikini"/);
	assert.match(message, /Keep the color/);
	assert.match(message, /a player in navy/);
});

test('rejects captions over 30 words', () => {
	const caption = Array.from({ length: 31 }, (_, index) => `word${index + 1}`).join(' ');
	assert.equal(inspectCaption(caption)[0]?.code, 'too-long');
});

test('correction message names the flagged words and their rules', () => {
	const message = buildCaptionCorrectionMessage(inspectCaption('A happy family celebrates.'));
	assert.match(message, /"family"/);
	assert.match(message, /"happy"/);
	assert.match(message, /relationship/);
	assert.match(message, /ONLY JSON/);
});

test('correction message gives a compression instruction for too-long captions', () => {
	const caption = Array.from({ length: 31 }, (_, index) => `word${index + 1}`).join(' ');
	const message = buildCaptionCorrectionMessage(inspectCaption(caption));
	assert.match(message, /30 words or fewer/);
	assert.doesNotMatch(message, /flagged words/);
});
