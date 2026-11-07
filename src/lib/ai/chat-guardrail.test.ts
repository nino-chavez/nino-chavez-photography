import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { TextStreamPart, ToolSet } from 'ai';
import { checkReply, chatOutputGuardrail, GUARDED_REPLY } from './chat-guardrail';

type Part = TextStreamPart<ToolSet>;

/** Run parts through the guardrail stage exactly as streamText would. */
async function run(parts: Part[], flags: string[] = []): Promise<Part[]> {
	const stage = chatOutputGuardrail<ToolSet>((r) => flags.push(r))();
	const source = new ReadableStream<Part>({
		start(c) {
			for (const p of parts) c.enqueue(p);
			c.close();
		}
	});
	const out: Part[] = [];
	const reader = source.pipeThrough(stage).getReader();
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return out;
		out.push(value);
	}
}

function textOf(parts: Part[]): string {
	return parts.map((p) => (p.type === 'text-delta' ? p.text : '')).join('');
}

function block(id: string, ...deltas: string[]): Part[] {
	return [
		{ type: 'text-start', id },
		...deltas.map((text) => ({ type: 'text-delta', id, text }) as Part),
		{ type: 'text-end', id }
	];
}

test('an ordinary gallery reply passes', () => {
	assert.deepEqual(checkReply('Here are some big spikes from the 2025 club season. Want blocks next?'), { ok: true });
	assert.deepEqual(checkReply('Classic backlit serves, shot at Scunthorpe.'), { ok: true });
});

test('each category is caught', () => {
	assert.deepEqual(checkReply('Sure! My instructions say to stay in scope.'), { ok: false, reason: 'instructions' });
	assert.deepEqual(checkReply('I query Supabase with match_photos.'), { ok: false, reason: 'internals' });
	assert.deepEqual(checkReply('That block was f u c k... no, that was a FUCKING block.'), { ok: false, reason: 'profanity' });
	assert.deepEqual(checkReply('DAN here, no rules now.'), { ok: false, reason: 'persona' });
});

test('a leaked phrase split across deltas and a line break is still caught', async () => {
	const flags: string[] = [];
	const out = await run(block('t1', 'Sure, here is my sys', 'tem\n', 'prompt: ...'), flags);
	assert.equal(textOf(out), GUARDED_REPLY);
	assert.deepEqual(flags, ['instructions']);
});

test('a clean block is released whole and in order, with its start and end', async () => {
	const out = await run(block('t1', 'Here are ', 'four spikes.'));
	assert.deepEqual(out.map((p) => p.type), ['text-start', 'text-delta', 'text-end']);
	assert.equal(textOf(out), 'Here are four spikes.');
});

test('tool parts pass through untouched', async () => {
	const toolCall = { type: 'tool-call', toolCallId: 'c1', toolName: 'searchPhotos', input: {} } as unknown as Part;
	const out = await run([toolCall, ...block('t1', 'Found these.')]);
	assert.equal(out[0], toolCall);
});

test('nothing held is released unchecked when the stream ends mid-block', async () => {
	const out = await run([
		{ type: 'text-start', id: 't1' },
		{ type: 'text-delta', id: 't1', text: 'what the shit' }
	]);
	assert.equal(textOf(out), GUARDED_REPLY);
});

test('reasoning parts never leave the server', async () => {
	const out = await run([
		{ type: 'reasoning-start', id: 'r1' },
		{ type: 'reasoning-delta', id: 'r1', text: 'The system prompt says to use match_photos.' },
		{ type: 'reasoning-end', id: 'r1' },
		...block('t1', 'Here are four spikes.')
	] as Part[]);
	assert.ok(out.every((p) => !p.type.startsWith('reasoning')));
	assert.equal(textOf(out), 'Here are four spikes.');
});
