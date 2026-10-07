import assert from 'node:assert/strict';
import test from 'node:test';
import { isAlbumKey } from './album-key';
import { albumIndexPath, dataPath, homePath, hostAddress, photosPath, settingsPath, sitePath, albumReportPath, cleanReportPath, internalReportPath, intelligenceEvidenceHref, isAnalyticsWorkspace } from './report-paths';

const HOST = 'analytics.ninochavez.co';

test('an album key is letters, digits, underscore and hyphen only', () => {
	for (const ok of ['Re7kho', 'DWdCET', 'a', 'a_b-C9', 'x'.repeat(64)]) assert.equal(isAlbumKey(ok), true, ok);
	for (const bad of ['', '..', '.', 'a/b', 'a%2Fb', '%2e%2e', 'a b', 'a.b', 'x'.repeat(65), '../sites', 'Re7kho/extra']) assert.equal(isAlbumKey(bad), false, bad);
});

test('the report host maps /albums/<key> to the internal route and back', () => {
	assert.equal(internalReportPath('/albums/Re7kho'), '/photography/analytics/albums/Re7kho');
	assert.equal(cleanReportPath('/photography/analytics/albums/Re7kho'), '/albums/Re7kho');
	// Both directions agree for every real-looking key.
	for (const key of ['Re7kho', 'fJKdsB', 'jq1Rp7', 'eEUGfA', '5M7kNx']) {
		assert.equal(cleanReportPath(internalReportPath(`/albums/${key}`)!), `/albums/${key}`);
		assert.equal(internalReportPath(cleanReportPath(`/photography/analytics/albums/${key}`)!), `/photography/analytics/albums/${key}`);
	}
});

test('anything that is not exactly one album key is not an album address', () => {
	for (const path of ['/albums/', '/albums/Re7kho/extra', '/albums/..', '/albums/%2e%2e', '/albums/a%2Fb', '/albums/a.b', '/albums//Re7kho', '/albumsX/Re7kho', '/albums/Re7kho/']) {
		assert.equal(internalReportPath(path), null, path);
	}
	for (const path of ['/photography/analytics/albums/', '/photography/analytics/albums/Re7kho/extra', '/photography/analytics/albums/..', '/photography/analytics/albums/%2e%2e', '/photography/analytics/albums/a%2Fb']) {
		assert.equal(cleanReportPath(path), null, path);
	}
});

test('existing report addresses are unchanged, and the old gallery report has no internal route left', () => {
	assert.equal(internalReportPath('/sites'), '/photography/analytics/sites');
	// /gallery and its CSV moved: they are redirected before routing, so nothing maps to them or from them.
	for (const old of ['/gallery', '/gallery/export.csv']) assert.equal(internalReportPath(old), null, old);
	for (const old of ['/photography/analytics/operator', '/photography/analytics/operator/export.csv', '/photography/analytics']) assert.equal(cleanReportPath(old), null, old);
	assert.equal(isAnalyticsWorkspace(null, HOST, '/gallery'), false);
	assert.equal(isAnalyticsWorkspace('/analytics/operator', 'localhost', '/photography/analytics/operator'), false);
});

test('the photo explorer and its CSV have clean addresses that map in both directions, and nothing else maps to them', () => {
	for (const [clean, internal] of [['/photos', '/photography/analytics/photos'], ['/photos/export.csv', '/photography/analytics/photos/export.csv']] as const) {
		assert.equal(internalReportPath(clean), internal);
		assert.equal(cleanReportPath(internal), clean);
		assert.equal(cleanReportPath(internalReportPath(clean)!), clean);
		assert.equal(cleanReportPath(`${internal}/extra`), null);
		assert.equal(internalReportPath(`${clean}/extra`), null);
	}
	assert.equal(photosPath(HOST), '/photos');
	assert.equal(photosPath(HOST, '/export.csv?period=7'), '/photos/export.csv?period=7');
	assert.equal(photosPath(HOST, '?scope=album&albums=Re7kho'), '/photos?scope=album&albums=Re7kho');
	assert.equal(photosPath('localhost'), '/photography/analytics/photos');
	assert.equal(photosPath('ninochavez.co', '/export.csv'), '/photography/analytics/photos/export.csv');
	assert.equal(isAnalyticsWorkspace(null, HOST, '/photos'), true);
	assert.equal(isAnalyticsWorkspace('/analytics/photos', 'localhost', '/photography/analytics/photos'), true);
	// On the gallery host, /photos is not an analytics page.
	assert.equal(isAnalyticsWorkspace(null, 'ninochavez.co', '/photos'), false);
	// An album whose key is "photos" is still an album report.
	assert.equal(internalReportPath('/albums/photos'), '/photography/analytics/albums/photos');
});

test('the site report has its own address on the report host and an internal one elsewhere', () => {
	assert.equal(sitePath(HOST), '/sites');
	assert.equal(sitePath(HOST, '?period=7'), '/sites?period=7');
	assert.equal(sitePath('localhost'), '/photography/analytics/sites');
});

test('a clean report address is placed on whichever host asks', () => {
	assert.equal(hostAddress(HOST, { pathname: '/photos', search: '?period=7', hash: '' }), '/photos?period=7');
	assert.equal(hostAddress('localhost', { pathname: '/photos', search: '?period=7', hash: '' }), '/photography/analytics/photos?period=7');
	assert.equal(hostAddress('localhost', { pathname: '/', search: '', hash: '' }), '/photography/analytics/home');
	assert.equal(hostAddress('localhost', { pathname: '/data', search: '?period=7', hash: '#arrivals' }), '/photography/analytics/data?period=7#arrivals');
	assert.equal(hostAddress('localhost', { pathname: '/albums/Re7kho', search: '', hash: '' }), '/photography/analytics/albums/Re7kho');
});

test('albumReportPath is the clean address on the report host and the internal route elsewhere', () => {
	assert.equal(albumReportPath(HOST, 'Re7kho'), '/albums/Re7kho');
	assert.equal(albumReportPath(HOST, 'Re7kho', '?x=1#grid'), '/albums/Re7kho?x=1#grid');
	assert.equal(albumReportPath('localhost', 'Re7kho'), '/photography/analytics/albums/Re7kho');
	assert.equal(albumReportPath('ninochavez.co', 'Re7kho'), '/photography/analytics/albums/Re7kho');
	assert.throws(() => albumReportPath(HOST, '../sites'), RangeError);
	assert.throws(() => albumReportPath(HOST, 'a/b'), RangeError);
});

test('the album report uses the analytics shell, and only on the report host or by its route id', () => {
	assert.equal(isAnalyticsWorkspace(null, HOST, '/albums/Re7kho'), true);
	assert.equal(isAnalyticsWorkspace('/analytics/albums/[albumKey]', 'localhost', '/photography/analytics/albums/Re7kho'), true);
	// The public gallery's own album page is not a report, on any host.
	assert.equal(isAnalyticsWorkspace('/albums/[slug]', 'ninochavez.co', '/photography/albums/Re7kho'), false);
	assert.equal(isAnalyticsWorkspace(null, 'ninochavez.co', '/albums/Re7kho'), false);
	assert.equal(isAnalyticsWorkspace(null, HOST, '/albums/a%2Fb'), false);
	assert.equal(isAnalyticsWorkspace(null, HOST, '/albums/'), false);
	assert.equal(isAnalyticsWorkspace(null, HOST, '/albums/Re7kho/extra'), false);
});

test('the album index has its own clean address, its CSV, and an internal route that maps back', () => {
	assert.equal(internalReportPath('/albums'), '/photography/analytics/albums');
	assert.equal(internalReportPath('/albums/export.csv'), '/photography/analytics/albums/export.csv');
	assert.equal(cleanReportPath('/photography/analytics/albums'), '/albums');
	assert.equal(cleanReportPath('/photography/analytics/albums/export.csv'), '/albums/export.csv');
	for (const path of ['/albums', '/albums/export.csv']) assert.equal(cleanReportPath(internalReportPath(path)!), path);
	// The CSV address is not an album key, so it can never be read as one album's report.
	assert.equal(isAlbumKey('export.csv'), false);
	assert.equal(albumIndexPath(HOST), '/albums');
	assert.equal(albumIndexPath(HOST, '/export.csv'), '/albums/export.csv');
	assert.equal(albumIndexPath('localhost'), '/photography/analytics/albums');
	assert.equal(albumIndexPath('ninochavez.co', '?compare=a'), '/photography/analytics/albums?compare=a');
	assert.equal(isAnalyticsWorkspace(null, HOST, '/albums'), true);
	assert.equal(isAnalyticsWorkspace('/analytics/albums', 'localhost', '/photography/analytics/albums'), true);
	// On the gallery host, /albums is not an analytics page.
	assert.equal(isAnalyticsWorkspace(null, 'ninochavez.co', '/albums'), false);
});

test('evidence links to an album report stay in the analytics shell; public album links keep going to the gallery', () => {
	assert.equal(intelligenceEvidenceHref(HOST, '/photography/analytics/albums/Re7kho?period=custom'), '/albums/Re7kho?period=custom');
	assert.equal(intelligenceEvidenceHref('localhost', '/analytics/albums/Re7kho'), '/photography/analytics/albums/Re7kho');
	assert.equal(intelligenceEvidenceHref(HOST, '/photography/analytics/albums/..'), null);
	// /albums/<slug> is the gallery's public album page and must keep its meaning.
	assert.equal(intelligenceEvidenceHref(HOST, '/albums/Re7kho'), 'https://ninochavez.co/photography/albums/Re7kho');
});

test('a link stored in a finding or a brief before the old gallery report moved goes to where that report went', () => {
	// The shapes the rules wrote: the internal path with no base, the full internal path, and the clean address.
	assert.equal(intelligenceEvidenceHref(HOST, '/gallery?period=7'), '/');
	assert.equal(intelligenceEvidenceHref(HOST, '/analytics/operator?period=custom&start=2026-09-01&end=2026-09-30&scope=album&albums=Re7kho&measure=photo_opens'), '/albums/Re7kho');
	assert.equal(intelligenceEvidenceHref('localhost', '/analytics/operator?period=custom&start=2026-09-01&end=2026-09-30&scope=album&albums=Re7kho'), '/photography/analytics/albums/Re7kho');
	assert.equal(intelligenceEvidenceHref(HOST, '/photography/analytics/operator?section=photos&period=7&measure=downloads'), '/photos?period=7&measure=downloads');
	assert.equal(intelligenceEvidenceHref('localhost', '/analytics/operator?section=measurement&period=7'), '/photography/analytics/data?period=7');
	assert.equal(intelligenceEvidenceHref(HOST, '/analytics/operator?intelligence_snapshot=abc#albums'), '/#albums');
	// A stored link never carries an album key that is not a key into a path.
	assert.equal(intelligenceEvidenceHref(HOST, '/analytics/operator?scope=album&albums=../sites'), '/');
	// The links the rules write now.
	assert.equal(intelligenceEvidenceHref(HOST, '/analytics/albums/Re7kho'), '/albums/Re7kho');
	assert.equal(intelligenceEvidenceHref(HOST, '/analytics/photos?period=custom&start=2026-09-01&end=2026-09-30'), '/photos?period=custom&start=2026-09-01&end=2026-09-30');
	assert.equal(intelligenceEvidenceHref('localhost', '/analytics/photos?period=7'), '/photography/analytics/photos?period=7');
});

test('Home is the root of the report host, with an internal route that maps back, and the old root mapping is untouched', () => {
	assert.equal(internalReportPath('/'), '/photography/analytics/home');
	assert.equal(cleanReportPath('/photography/analytics/home'), '/');
	assert.equal(cleanReportPath(internalReportPath('/')!), '/');
	assert.equal(internalReportPath(cleanReportPath('/photography/analytics/home')!), '/photography/analytics/home');
	// The legacy bookmark address is redirected to Home by the old-address rules before it is routed.
	assert.equal(cleanReportPath('/photography/analytics'), null);
	assert.equal(cleanReportPath('/photography/analytics/home/extra'), null);
	assert.equal(internalReportPath('/home'), null);
	assert.equal(homePath(HOST), '/');
	assert.equal(homePath(HOST, '?x=1'), '/?x=1');
	assert.equal(homePath('localhost'), '/photography/analytics/home');
	assert.equal(homePath('ninochavez.co'), '/photography/analytics/home');
	assert.equal(isAnalyticsWorkspace(null, HOST, '/'), true);
	assert.equal(isAnalyticsWorkspace('/analytics/home', 'localhost', '/photography/analytics/home'), true);
	// The gallery's own root is the public site, not a report.
	assert.equal(isAnalyticsWorkspace(null, 'ninochavez.co', '/'), false);
	assert.equal(isAnalyticsWorkspace('/', 'ninochavez.co', '/photography'), false);
});

test('the data quality page and settings have clean addresses that map in both directions, and nothing else maps to them', () => {
	for (const [clean, internal] of [['/data', '/photography/analytics/data'], ['/settings', '/photography/analytics/settings']] as const) {
		assert.equal(internalReportPath(clean), internal);
		assert.equal(cleanReportPath(internal), clean);
		assert.equal(cleanReportPath(internalReportPath(clean)!), clean);
		assert.equal(internalReportPath(cleanReportPath(internal)!), internal);
		assert.equal(cleanReportPath(`${internal}/extra`), null);
		assert.equal(internalReportPath(`${clean}/extra`), null);
		assert.equal(internalReportPath(`${clean}.csv`), null);
	}
	// A page with an album's key as its name is still an album report, not one of these.
	assert.equal(internalReportPath('/albums/data'), '/photography/analytics/albums/data');
	assert.equal(internalReportPath('/albums/settings'), '/photography/analytics/albums/settings');
	assert.equal(dataPath(HOST), '/data');
	assert.equal(dataPath(HOST, '?period=7#coverage'), '/data?period=7#coverage');
	assert.equal(dataPath('localhost', '#status'), '/photography/analytics/data#status');
	assert.equal(dataPath('ninochavez.co'), '/photography/analytics/data');
	assert.equal(settingsPath(HOST), '/settings');
	assert.equal(settingsPath('localhost'), '/photography/analytics/settings');
	assert.equal(isAnalyticsWorkspace(null, HOST, '/data'), true);
	assert.equal(isAnalyticsWorkspace(null, HOST, '/settings'), true);
	assert.equal(isAnalyticsWorkspace('/analytics/data', 'localhost', '/photography/analytics/data'), true);
	assert.equal(isAnalyticsWorkspace('/analytics/settings', 'localhost', '/photography/analytics/settings'), true);
	// On the gallery host these are not analytics pages.
	assert.equal(isAnalyticsWorkspace(null, 'ninochavez.co', '/data'), false);
	assert.equal(isAnalyticsWorkspace(null, 'ninochavez.co', '/settings'), false);
	assert.equal(isAnalyticsWorkspace(null, HOST, '/data/extra'), false);
});
