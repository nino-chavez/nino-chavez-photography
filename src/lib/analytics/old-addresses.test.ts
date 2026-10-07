import assert from 'node:assert/strict';
import test from 'node:test';
import { oldAddressTarget } from './old-addresses';

/** The address as a reader sees it: path, query, anchor. */
function moved(pathname: string, search = ''): string | null {
	const target = oldAddressTarget(pathname, search);
	return target ? `${target.pathname}${target.search}${target.hash}` : null;
}

// One row per old address. Each row is also a line of the redirect table in the audit README.
const TABLE: Array<[string, string, string]> = [
	['/gallery', '', '/'],
	['/gallery', '?section=overview', '/'],
	['/gallery', '?section=overview&period=7&measure=downloads&compare=publication_age', '/'],
	['/gallery', '?period=30&scope=all', '/'],
	['/gallery', '?scope=album&albums=Re7kho&period=custom&start=2026-09-25&end=2026-10-02', '/albums/Re7kho'],
	['/gallery', '?section=overview&scope=album&albums=Re7kho', '/albums/Re7kho'],
	['/gallery', '?section=albums', '/albums'],
	['/gallery', '?section=albums&scope=album&albums=Re7kho', '/albums/Re7kho'],
	['/gallery', '?section=albums&scope=selected&albums=Re7kho,fJKdsB,jq1Rp7', '/albums?compare=Re7kho%2CfJKdsB%2Cjq1Rp7'],
	['/gallery', '?section=photos', '/photos'],
	['/gallery', '?section=photos&period=7&measure=downloads&scope=album&albums=Re7kho&photo_rank=rising&photo_page=2', '/photos?period=7&measure=downloads&scope=album&albums=Re7kho&photo_page=2&photo_rank=rising'],
	['/gallery', '?section=photos&sport=volleyball&category=action&source=profile&traffic=inclusive&event_date=2026-09-25&season=2026&event_type=tournament&compare=none', '/photos?traffic=inclusive&sport=volleyball&category=action&source=profile&event_date=2026-09-25&season=2026&event_type=tournament&compare=none'],
	['/gallery', '?section=sources', '/data#arrivals'],
	['/gallery', '?section=sources&period=7', '/data?period=7#arrivals'],
	['/gallery', '?section=sources&scope=album&albums=Re7kho', '/albums/Re7kho'],
	['/gallery', '?section=measurement', '/data'],
	['/gallery', '?section=measurement&period=90&event_page=3', '/data?period=90'],
	['/gallery', '?section=analytics-preferences', '/settings'],
	['/gallery', '?section=preferences', '/settings'],
	['/gallery', '?section=nonsense', '/'],
	['/gallery', '?section=nonsense&scope=album&albums=Re7kho', '/'],
	['/gallery/export.csv', '', '/photos/export.csv'],
	['/gallery/export.csv', '?period=custom&start=2026-09-25&end=2026-10-02&measure=photo_opens&scope=album&albums=Re7kho&traffic=conservative&compare=none', '/photos/export.csv?period=custom&start=2026-09-25&end=2026-10-02&measure=photo_opens&scope=album&albums=Re7kho&traffic=conservative&compare=none'],
	['/gallery/export.csv', '?measure=downloads&shortlist=a,b', '/photos/export.csv?measure=downloads&shortlist=a%2Cb'],
	// An explicitly empty shortlist asks for a file with no photos. Dropping it would export every photo instead.
	['/gallery/export.csv', '?measure=downloads&shortlist=', '/photos/export.csv?measure=downloads&shortlist='],
	['/gallery/export.csv', '?period=7&sport=&category=', '/photos/export.csv?period=7'],
	['/photography/analytics', '', '/'],
	['/photography/analytics', '?period=30', '/'],
	['/photography/analytics/operator', '', '/'],
	['/photography/analytics/operator', '?section=photos&photo_rank=recent', '/photos?photo_rank=recent'],
	['/photography/analytics/operator', '?section=measurement&period=7', '/data?period=7'],
	['/photography/analytics/operator/export.csv', '?measure=downloads', '/photos/export.csv?measure=downloads']
];

for (const [path, search, expected] of TABLE) {
	test(`${path}${search} -> ${expected}`, () => {
		assert.equal(moved(path, search), expected);
	});
}

test('an address that is not an old one is left alone', () => {
	for (const path of ['/', '/sites', '/albums', '/albums/Re7kho', '/data', '/settings', '/photos', '/photos/export.csv', '/gallery/', '/gallery/other', '/gallerys', '/photography/gallery', '/photography/analytics/home', '/photography/analytics/operatorx', '/photography/analytics/operator/other', '/albums/gallery']) {
		assert.equal(oldAddressTarget(path, '?section=photos'), null, path);
	}
});

test('section means the old report only on the old addresses: the site report has its own', () => {
	assert.equal(oldAddressTarget('/sites', '?period=30&section=profile'), null);
	assert.equal(oldAddressTarget('/photography/analytics/sites', '?section=writing'), null);
});

test('Home never takes a query: Page Rule 49cd0626 forwards /?* to the site report before the app is reached', () => {
	for (const search of ['', '?section=overview', '?period=7', '?section=bogus&period=7', '?scope=all&measure=downloads']) {
		const target = oldAddressTarget('/gallery', search);
		assert.deepEqual(target, { pathname: '/', search: '', hash: '' }, search);
	}
});

test('an album key is validated before it goes into a path', () => {
	for (const bad of ['..', 'a/b', 'a%2Fb', '%2e%2e', 'a b', 'a.b', 'x'.repeat(65), '', '../sites', 'Re7kho/extra']) {
		const params = new URLSearchParams({ section: 'albums', scope: 'album', albums: bad });
		assert.equal(moved('/gallery', `?${params}`), '/albums', JSON.stringify(bad));
		const overview = new URLSearchParams({ scope: 'album', albums: bad });
		assert.equal(moved('/gallery', `?${overview}`), '/', JSON.stringify(bad));
	}
	// One valid key among bad ones is not "exactly one album" for the old report either.
	assert.equal(moved('/gallery', '?scope=album&albums=Re7kho,..'), '/');
	// Selected scope keeps the valid keys only, and needs two of them.
	assert.equal(moved('/gallery', '?section=albums&scope=selected&albums=Re7kho,..,fJKdsB'), '/albums?compare=Re7kho%2CfJKdsB');
	assert.equal(moved('/gallery', '?section=albums&scope=selected&albums=Re7kho,..'), '/albums');
	assert.equal(moved('/gallery', '?section=albums&scope=selected&albums=Re7kho,Re7kho'), '/albums');
});

test('only the query the new page reads is carried over, and nothing else is invented', () => {
	const target = oldAddressTarget('/gallery', '?section=photos&period=7&evil=1&albums=Re7kho&redirect=https://example.invalid&intelligence_snapshot=abc');
	assert.deepEqual(target, { pathname: '/photos', search: '?period=7&albums=Re7kho', hash: '' });
	// Data reads a number of days, and only 7, 30 or 90. A custom range has no equal there.
	assert.equal(moved('/gallery', '?section=measurement&period=custom&start=2026-09-25&end=2026-10-02'), '/data');
	assert.equal(moved('/gallery', '?section=measurement&period=14'), '/data');
	assert.equal(moved('/gallery', '?section=sources&period=custom'), '/data#arrivals');
});

test('every target is a path on the report host: nothing the old query holds can choose the destination', () => {
	const origin = 'https://analytics.ninochavez.co';
	for (const search of ['?section=//evil.invalid', '?section=https://evil.invalid', '?section=photos&albums=//evil.invalid', '?section=albums&scope=selected&albums=//evil.invalid,x', '?next=//evil.invalid']) {
		for (const path of ['/gallery', '/gallery/export.csv', '/photography/analytics/operator']) {
			const target = oldAddressTarget(path, search)!;
			assert.equal(new URL(`${target.pathname}${target.search}${target.hash}`, origin).origin, origin, `${path}${search}`);
		}
	}
});
