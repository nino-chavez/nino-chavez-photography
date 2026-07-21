import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_CAPTION_CORRECTIONS } from './caption-contract';
import { extractOne } from './ingest-extraction';

function completion(obj: Record<string, unknown>, cost: number) {
	return {
		choices: [{ message: { content: JSON.stringify(obj) } }],
		usage: { cost }
	};
}

function fakeResponse(payload: unknown): Response {
	return {
		ok: true,
		status: 200,
		json: async () => payload,
		text: async () => JSON.stringify(payload)
	} as unknown as Response;
}

const BASE = {
	photo_category: 'candid',
	play_type: null,
	sharpness: 7,
	composition_score: 6,
	exposure_accuracy: 7,
	emotional_impact: 5,
	players: [],
	visible_text: []
};

test('extractOne corrects a contract-violating caption conversationally', async () => {
	const calls: any[] = [];
	const responses = [
		completion({ ...BASE, caption: 'A family poses happily for a photo.' }, 1),
		completion({ ...BASE, caption: 'A man, a woman, and two children pose in front of a banner.' }, 2)
	];
	const fetchImpl = (async (_url: any, init: any) => {
		calls.push(JSON.parse(init.body));
		return fakeResponse(responses[calls.length - 1]);
	}) as unknown as typeof fetch;

	const result = await extractOne(Buffer.from('img'), { albumSport: null, apiKey: 'k', fetchImpl });
	assert.equal(result.extraction.caption, 'A man, a woman, and two children pose in front of a banner.');
	assert.equal(result.cost, 3);
	assert.equal(calls.length, 2);
	// The retry must carry the model's own bad answer plus the correction message.
	assert.equal(calls[1].messages.length, 3);
	assert.equal(calls[1].messages[1].role, 'assistant');
	assert.match(calls[1].messages[2].content, /visible-facts/);
	assert.match(calls[1].messages[2].content, /"family"/);
});

test('extractOne throws the contract error after exhausting corrections', async () => {
	let calls = 0;
	const fetchImpl = (async () => {
		calls++;
		return fakeResponse(completion({ ...BASE, caption: 'A proud family celebrates the winning point.' }, 1));
	}) as unknown as typeof fetch;

	await assert.rejects(
		() => extractOne(Buffer.from('img'), { albumSport: null, apiKey: 'k', fetchImpl }),
		/caption contract: relationship-claim/
	);
	assert.equal(calls, MAX_CAPTION_CORRECTIONS + 1);
});
