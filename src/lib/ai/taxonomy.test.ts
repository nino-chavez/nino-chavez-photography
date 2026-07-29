/**
 * Guards the SHAPE of the generated CHECK constraints, not their contents.
 *
 * `taxonomy-check.ts` already proves the committed SQL matches what these renderers emit, and
 * `taxonomy-audit.ts` proves the live database matches the vocabulary. Neither catches the
 * failure that actually happened: a constraint written `col = ANY (ARRAY[..., NULL])`, which
 * evaluates to NULL for any non-matching value — and a CHECK passes on NULL, so it rejected
 * nothing for its entire life while `pg_constraint.convalidated` still read `true`. A drift
 * check cannot see that, because the generated file and the renderer agreed with each other.
 *
 * These assert the invariant the comments in taxonomy.ts state in prose: every constraint is
 * `col IS NULL OR col IN (...)`, and no NULL ever appears inside a value list.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	renderPhotoCategoryCheck,
	renderPlayTypeCheck,
	renderPlayForSportCheck,
	renderSql,
	PHOTO_CATEGORIES,
	ALL_PLAY_TYPES
} from './taxonomy';

const RENDERERS: Array<[string, () => string]> = [
	['valid_photo_category', renderPhotoCategoryCheck],
	['valid_play_type', renderPlayTypeCheck],
	['valid_play_for_sport', renderPlayForSportCheck]
];

/** The DDL with `-- …` lines removed — the prose explains the NULL trap and would match it. */
function statements(sql: string): string {
	return sql
		.split('\n')
		.filter((l) => !l.trimStart().startsWith('--'))
		.join('\n');
}

/** Every `IN (...)` value list in the rendered DDL. */
function valueLists(sql: string): string[] {
	return [...statements(sql).matchAll(/\bIN\s*\(([^)]*)\)/gi)].map((m) => m[1]);
}

for (const [name, render] of RENDERERS) {
	test(`${name} expresses nullability with IS NULL, not a NULL in the list`, () => {
		const sql = render();
		assert.match(sql, /IS NULL OR/, `${name} must have an explicit IS NULL disjunct`);
		assert.doesNotMatch(sql, /ANY\s*\(\s*ARRAY/i, `${name} must use IN (...), not = ANY (ARRAY[...])`);

		const lists = valueLists(sql);
		assert.ok(lists.length > 0, `${name} rendered no IN (...) list to check`);
		for (const list of lists) {
			assert.doesNotMatch(list, /\bNULL\b/i, `${name} must never place NULL inside a value list`);
			// Every element is a quoted literal; a bare identifier here would be a rendering bug.
			for (const el of list.split(',')) assert.match(el.trim(), /^'[a-z_]+'$/);
		}
	});

	test(`${name} is added NOT VALID so the migration controls when it is checked`, () => {
		assert.match(render(), /\) NOT VALID;/);
	});
}

test('photo_category renders every value in the vocabulary and nothing else', () => {
	const sql = renderPhotoCategoryCheck();
	for (const c of PHOTO_CATEGORIES) assert.match(sql, new RegExp(`'${c}'`));
	const quoted = [...sql.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
	assert.deepEqual(new Set(quoted), new Set(PHOTO_CATEGORIES));
});

test('renderSql emits all three constraints', () => {
	const sql = renderSql();
	for (const [name] of RENDERERS) {
		assert.match(sql, new RegExp(`ADD CONSTRAINT ${name} CHECK`), `${name} missing from renderSql`);
	}
});

test('the flat play vocabulary stays deduped and sorted', () => {
	// ALL_PLAY_TYPES is a Set-flattened union; a duplicate would render a constraint that
	// lists the same literal twice, which is legal SQL and therefore silent.
	assert.deepEqual(ALL_PLAY_TYPES, [...new Set(ALL_PLAY_TYPES)].sort());
});
