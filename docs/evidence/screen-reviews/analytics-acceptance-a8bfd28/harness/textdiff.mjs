// Which owner-role pages differ from the visitor pages only because the local server has no provider credentials.
const payload = Buffer.from(JSON.stringify({ sub: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', role: 'authenticated', aud: 'authenticated', exp: 4102444800 })).toString('base64url');
const token = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.walk`;
const session = 'base64-' + Buffer.from(JSON.stringify({ access_token: token, refresh_token: 'walk-refresh', expires_in: 3600, expires_at: 4102444800, token_type: 'bearer', user: { id: '00000000-0000-4000-8000-000000000042', email: 'walk-owner@example.test', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' } })).toString('base64url');
const text = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ');
const phrases = [/Cloudflare[^.]{0,80}(not configured|not available|unavailable|could not)[^.]*\./i, /not available/i, /Page loads on ninochavez\.co/i, /unavailable/i];
for (const [name, v, o] of [['home', '/', '/home'], ['sites', '/sites', '/sites'], ['data', '/data', '/data'], ['albums', '/albums', '/albums'], ['album-Re7kho', '/albums/Re7kho', '/albums/Re7kho'], ['photos', '/photos', '/photos'], ['settings', '/settings', '/settings']]) {
	const vis = text(await (await fetch('https://analytics.ninochavez.co' + v)).text());
	const own = text(await (await fetch('http://127.0.0.1:5421/photography/analytics' + o, { headers: { cookie: `sb-skywzpcekhntecegyjoj-auth-token=${session}` } })).text());
	const find = (t) => phrases.map((p) => (t.match(p) ?? [''])[0].slice(0, 160)).filter(Boolean);
	console.log(`== ${name}\n  visitor: ${vis.length} chars; matches: ${JSON.stringify(find(vis))}\n  owner:   ${own.length} chars; matches: ${JSON.stringify(find(own))}`);
	for (const m of own.matchAll(/(unavailable|Could not be read|not configured|not available)/gi)) console.log('    owner context:', own.slice(Math.max(0, m.index - 90), m.index + 110));
	await new Promise((r) => setTimeout(r, 1200));
}
