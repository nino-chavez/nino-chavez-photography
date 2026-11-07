import { test } from 'node:test';
import assert from 'node:assert/strict';
import { asSchema } from 'ai';
import { searchPhotosTool, CHAT_MAX_STEPS } from './chat-search-tool';

// The JSON schema the SDK actually sends to the model for this tool. A v4-style `parameters`
// key leaves `inputSchema` undefined, which the SDK turns into `{ properties: {} }` — so an
// empty property list here is exactly the regression this file exists to catch.
function sentSchema() {
	const t = searchPhotosTool(async () => ({ photos: [] }));
	return asSchema(t.inputSchema).jsonSchema as { properties?: Record<string, unknown> };
}

test('the model is offered every search argument', () => {
	const props = Object.keys(sentSchema().properties ?? {}).sort();
	assert.deepEqual(props, ['jersey_number', 'photo_category', 'play_type', 'query', 'sport_type']);
});

test('the tool hands the model input to the execute it was built with', async () => {
	let seen: string | undefined;
	const t = searchPhotosTool(async (input) => {
		seen = input.query;
		return { photos: [] };
	});
	const out = await t.execute!({ query: 'backlit serve' }, { toolCallId: 't1', messages: [] });
	assert.equal(seen, 'backlit serve');
	assert.deepEqual(out, { photos: [] });
});

test('a reply has room for a search, one retry and the answer', () => {
	assert.equal(CHAT_MAX_STEPS, 3);
});
