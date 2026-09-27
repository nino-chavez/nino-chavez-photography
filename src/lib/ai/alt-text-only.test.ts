import assert from 'node:assert/strict';
import test from 'node:test';
import { MAX_ALT_TEXT_CORRECTIONS } from './alt-text-contract';
import { extractAltTextOnly } from './alt-text-only';

function completion(altText: string, cost: number) {
	return {
		choices: [{ message: { content: JSON.stringify({ alt_text: altText }) } }],
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

test('extractAltTextOnly returns a contract-clean value on the first call', async () => {
	const fetchImpl = (async () =>
		fakeResponse(completion('A player in white blocks near the net as a teammate in navy watches.', 1))) as unknown as typeof fetch;
	const result = await extractAltTextOnly(Buffer.from('img'), { apiKey: 'k', fetchImpl });
	assert.equal(result.altText, 'A player in white blocks near the net as a teammate in navy watches.');
	assert.equal(result.cost, 1);
});

test('extractAltTextOnly corrects a jersey-number value conversationally', async () => {
	const calls: any[] = [];
	const responses = [
		completion('A player in red digs near the sideline as numbers 3 and 12 watch.', 1),
		completion('A player in red digs near the sideline as teammates watch.', 2)
	];
	const fetchImpl = (async (_url: any, init: any) => {
		calls.push(JSON.parse(init.body));
		return fakeResponse(responses[calls.length - 1]);
	}) as unknown as typeof fetch;

	const result = await extractAltTextOnly(Buffer.from('img'), { apiKey: 'k', fetchImpl });
	assert.equal(result.altText, 'A player in red digs near the sideline as teammates watch.');
	assert.equal(result.cost, 3);
	assert.equal(calls.length, 2);
	assert.equal(calls[1].messages.length, 3);
	assert.match(calls[1].messages[2].content, /alt-text rule/);
	assert.match(calls[1].messages[2].content, /"3"/);
});

test('extractAltTextOnly throws the alt-text contract error after exhausting corrections', async () => {
	let calls = 0;
	const fetchImpl = (async () => {
		calls++;
		return fakeResponse(completion('A player wearing #9 blocks at the net.', 1));
	}) as unknown as typeof fetch;

	await assert.rejects(
		() => extractAltTextOnly(Buffer.from('img'), { apiKey: 'k', fetchImpl }),
		/alt text contract: jersey-number/
	);
	assert.equal(calls, MAX_ALT_TEXT_CORRECTIONS + 1);
});

test('extractAltTextOnly cross-checks a passed-in visibleText (the row\'s own stored value)', async () => {
	const calls: any[] = [];
	const responses = [
		completion('A player in white named Sikora blocks at the net.', 1),
		completion('A player in white blocks at the net.', 2)
	];
	const fetchImpl = (async (_url: any, init: any) => {
		calls.push(JSON.parse(init.body));
		return fakeResponse(responses[calls.length - 1]);
	}) as unknown as typeof fetch;

	const result = await extractAltTextOnly(Buffer.from('img'), {
		apiKey: 'k',
		fetchImpl,
		visibleText: ['Sikora', 'LEWIS']
	});
	assert.equal(result.altText, 'A player in white blocks at the net.');
	assert.match(calls[1].messages[2].content, /"Sikora"/);
});

test('extractAltTextOnly throws a plain error when nothing parses', async () => {
	const fetchImpl = (async () =>
		fakeResponse({ choices: [{ message: { content: 'not json at all' } }], usage: { cost: 0 } })) as unknown as typeof fetch;
	await assert.rejects(
		() => extractAltTextOnly(Buffer.from('img'), { apiKey: 'k', fetchImpl }),
		/no alt_text parsed/
	);
});
