import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';
import { embedImage, embedImageQuery, IMAGE_EMBEDDING_DIMS } from './embeddings';

function fakeResponse(payload: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		json: async () => payload,
		text: async () => JSON.stringify(payload)
	} as unknown as Response;
}

function embeddingPayload(promptTokens: number, dims = IMAGE_EMBEDDING_DIMS): unknown {
	return {
		data: [{ embedding: new Array(dims).fill(0.01) }],
		usage: { prompt_tokens: promptTokens, cost: 0.00012 }
	};
}

async function tinyJpeg(): Promise<Buffer> {
	return sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 10, g: 20, b: 30 } } })
		.jpeg()
		.toBuffer();
}

test('embedImage returns null without an API key (no network call)', async () => {
	const calls: unknown[] = [];
	const fetchImpl = (async () => { calls.push(1); return fakeResponse({}); }) as unknown as typeof fetch;
	const result = await embedImage(await tinyJpeg(), null, fetchImpl);
	assert.equal(result, null);
	assert.equal(calls.length, 0);
});

test('embedImage returns null for an empty buffer (no network call)', async () => {
	const calls: unknown[] = [];
	const fetchImpl = (async () => { calls.push(1); return fakeResponse({}); }) as unknown as typeof fetch;
	const result = await embedImage(Buffer.alloc(0), 'k', fetchImpl);
	assert.equal(result, null);
	assert.equal(calls.length, 0);
});

test('embedImage sends the corrected image_url content shape, not a bare data-URL string', async () => {
	let body: any;
	const fetchImpl = (async (_url: any, init: any) => {
		body = JSON.parse(init.body);
		return fakeResponse(embeddingPayload(258));
	}) as unknown as typeof fetch;

	const result = await embedImage(await tinyJpeg(), 'k', fetchImpl);
	assert.ok(result);
	assert.equal(result!.vector.length, IMAGE_EMBEDDING_DIMS);
	assert.equal(result!.cost, 0.00012);
	assert.equal(result!.promptTokens, 258);

	assert.equal(body.model, 'google/gemini-embedding-2');
	assert.equal(body.dimensions, IMAGE_EMBEDDING_DIMS);
	assert.ok(Array.isArray(body.input) && body.input.length === 1);
	// The shape that actually embeds an image: NOT `input: [dataUrl]` (a bare string), but the
	// chat-style content wrapper. Asserting the shape here is the regression guard for the bug
	// this file's header describes (a data-URL string silently tokenized as text).
	assert.equal(typeof body.input[0], 'object');
	assert.ok(Array.isArray(body.input[0].content));
	assert.equal(body.input[0].content[0].type, 'image_url');
	assert.ok(String(body.input[0].content[0].image_url.url).startsWith('data:image/jpeg;base64,'));
});

test('embedImage THROWS (does not return null) when prompt_tokens is text-sized', async () => {
	const fetchImpl = (async () => fakeResponse(embeddingPayload(657786))) as unknown as typeof fetch;
	const buf = await tinyJpeg();
	await assert.rejects(
		() => embedImage(buf, 'k', fetchImpl),
		/prompt_tokens=657786 exceeds/
	);
});

test('embedImage returns null on a non-retryable non-ok HTTP response (e.g. 400)', async () => {
	const fetchImpl = (async () => fakeResponse({ error: 'bad request' }, false, 400)) as unknown as typeof fetch;
	const result = await embedImage(await tinyJpeg(), 'k', fetchImpl);
	assert.equal(result, null);
});

test('embedImage THROWS RETRY:<status> on 429/5xx, same convention as extractOne', async () => {
	const buf = await tinyJpeg();
	const fetchImpl429 = (async () => fakeResponse({ error: 'rate limited' }, false, 429)) as unknown as typeof fetch;
	await assert.rejects(() => embedImage(buf, 'k', fetchImpl429), /RETRY:429/);

	const fetchImpl500 = (async () => fakeResponse({ error: 'server error' }, false, 500)) as unknown as typeof fetch;
	await assert.rejects(() => embedImage(buf, 'k', fetchImpl500), /RETRY:500/);
});

test('embedImageQuery returns null without an API key or empty text (no network call)', async () => {
	const calls: unknown[] = [];
	const fetchImpl = (async () => { calls.push(1); return fakeResponse({}); }) as unknown as typeof fetch;
	assert.equal(await embedImageQuery('a query', null, fetchImpl), null);
	assert.equal(await embedImageQuery('   ', 'k', fetchImpl), null);
	assert.equal(calls.length, 0);
});

test('embedImageQuery sends plain text input (not the image content wrapper) in the same model+dims as embedImage', async () => {
	let body: any;
	const fetchImpl = (async (_url: any, init: any) => {
		body = JSON.parse(init.body);
		return fakeResponse(embeddingPayload(6));
	}) as unknown as typeof fetch;

	const vector = await embedImageQuery('players diving near the net', 'k', fetchImpl);
	assert.ok(Array.isArray(vector));
	assert.equal(vector!.length, IMAGE_EMBEDDING_DIMS);
	assert.equal(body.model, 'google/gemini-embedding-2');
	assert.equal(body.dimensions, IMAGE_EMBEDDING_DIMS);
	assert.equal(body.input, 'players diving near the net');
});

test('embedImageQuery returns null on a dimension mismatch', async () => {
	const fetchImpl = (async () => fakeResponse(embeddingPayload(6, 512))) as unknown as typeof fetch;
	const vector = await embedImageQuery('a query', 'k', fetchImpl);
	assert.equal(vector, null);
});
