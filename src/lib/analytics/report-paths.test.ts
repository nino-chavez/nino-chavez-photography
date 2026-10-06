import assert from 'node:assert/strict';
import test from 'node:test';
import { albumIndexPath, albumReportPath, cleanReportPath, internalReportPath, intelligenceEvidenceHref, isAlbumKey, isAnalyticsWorkspace } from './report-paths';

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

test('existing report addresses are unchanged', () => {
	assert.equal(internalReportPath('/sites'), '/photography/analytics/sites');
	assert.equal(internalReportPath('/gallery'), '/photography/analytics/operator');
	assert.equal(cleanReportPath('/photography/analytics/operator'), '/gallery');
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
	assert.equal(intelligenceEvidenceHref(HOST, '/gallery?period=7'), '/gallery?period=7');
});
