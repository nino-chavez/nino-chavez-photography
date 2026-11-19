import assert from 'node:assert/strict';
import test from 'node:test';
import { schemaDumpProblems } from './schema-dump-guard.mjs';

// Invented values only. The credential-shaped ones are assembled at run time, so no secret scanner
// reads this file as holding a token; each still has the shape its check looks for.
const segment = (c) => c.repeat(16);
const fake = {
	jwt: `ey${'J'}${segment('a')}.${segment('b')}.${segment('c')}`,
	supabaseKey: ['sb', 'secret', segment('d')].join('_'),
	privateKey: ['-----BEGIN', 'PRIVATE', 'KEY-----'].join(' '),
	bearer: ['Bearer', segment('e') + segment('f')].join(' ')
};
const structure = `CREATE TABLE public.photo_metadata (photo_id text PRIMARY KEY, image_key text);
CREATE POLICY "Public read access" ON public.photo_metadata FOR SELECT USING (true);
CREATE FUNCTION public.f() RETURNS void LANGUAGE sql AS $$ SELECT 1 $$;
CREATE FUNCTION public.g() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.albums (album_key) VALUES ('x');
  insert into analytics_private.runs (id) values (1);
END $$;`;

test('structure alone passes, including INSERT statements inside function bodies', () => {
	assert.deepEqual(schemaDumpProblems(structure), []);
});

test('each kind of content that must not reach a public repository is refused', () => {
	const cases = [
		['COPY public.photo_metadata (photo_id) FROM stdin;', 'data rows'],
		['INSERT INTO public.albums VALUES (1);', 'data rows'],
		['-- Data for Name: albums; Type: TABLE DATA; Schema: public; Owner: postgres', 'data rows'],
		['INSERT INTO "public"."albums" ("album_key") VALUES (\'a1\');', 'data rows'],
		[`SELECT '${fake.jwt}';`, 'JSON Web Token'],
		[`SELECT '${fake.supabaseKey}';`, 'Supabase or Stripe key'],
		[`-- ${fake.privateKey}`, 'private key'],
		[`SELECT '${fake.bearer}';`, 'bearer token'],
		["CREATE POLICY p ON t USING (auth.email() = 'owner@example.com');", 'email address']
	];
	for (const [sql, what] of cases) {
		const problems = schemaDumpProblems(`${structure}\n${sql}`);
		assert.ok(problems.some((p) => p.includes(what)), `${what}: ${JSON.stringify(problems)}`);
	}
});
