import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportCsv, type OperatorReport } from './operator-report.server';
import type { ReportQuery } from './report-contract';

const query: ReportQuery = {
	start: '2026-09-01',
	end: '2026-09-30',
	measure: 'photo_opens',
	scope: 'all',
	albumKeys: [],
	traffic: 'conservative',
	compare: 'previous'
};

function report(overrides: Partial<OperatorReport> = {}): OperatorReport {
	return {
		available: true,
		query,
		previous: { start: '2026-08-02', end: '2026-08-31' },
		comparison: { start: '2026-08-02', end: '2026-08-31', total: 0, coverage: 'complete', label: 'Previous equal period' },
		coverage: 'complete', previousCoverage: 'complete', total: 0, previousTotal: 0, change: null,
		observedTotal:0, catalogueBasis:'event_snapshot', today:{date:'2026-09-28',count:null,asOf:null}, dataAsOf:null, preservedSince:null,
		daily: [], albums: [], photos: [], albumOnlyActions:[], sources: { arrivals: [], openLocations: [], unknown: 0 },
		traffic: [], trafficImpact: [], diagnostics: [], diagnosticsCoverage: { availableFrom: null, label: 'No diagnostic coverage.', error:null },
		visitorEstimate: { value: 7, limit: 'Estimated browsers.' },
		publicationAge: { available: false, label: 'Not selected.', days: 30, albums: [], missingAlbumKeys: [] },
		generatedAt: '2026-09-28T12:00:00.000Z',
		...overrides
	};
}

test('full photo export preserves more than the PostgREST default page', () => {
	const photos = Array.from({ length: 1_105 }, (_, index) => ({
		photoId: `photo-${index + 1}`,
		albumKey: 'alpha',
		count: index + 1,
		previousCount: index,
		difference: 1,
		lastActivity: '2026-09-28T12:00:00.000Z',
		imageUrl: null
	}));
	const csv = reportCsv(report({ photos }));
	assert.equal(csv.split('\n').length, 1_106);
	assert.match(csv, /"photo-1105"/);
});

test('album-open export emits album grain even when there are no photo rows', () => {
	const csv = reportCsv(report({
		query: { ...query, measure: 'album_opens' },
		albums: [{ albumKey: 'alpha', count: 12, previousCount: 8, difference: 4, lastActivity: '2026-09-28T12:00:00.000Z', publicationAt: null }]
	}));
	assert.equal(csv.split('\n').length, 2);
	assert.match(csv, /^"row_type"/);
	assert.match(csv, /"album","","alpha","12"/);
});

test('spreadsheet formulas are neutralized in every exported string field', () => {
	const csv = reportCsv(report({
		photos: [{ photoId: '=IMPORTXML("https://example.invalid")', albumKey: '+unsafe', count: 1, previousCount: 0, difference: 1, lastActivity: '@NOW()', imageUrl: null }]
	}));
	assert.match(csv, /"'=IMPORTXML/);
	assert.match(csv, /"'\+unsafe"/);
	assert.match(csv, /"'@NOW\(\)"/);
});


test('mixed download export preserves both photo and album-only actions without double counting', () => {
 const value=report({query:{...query,measure:'downloads'},
  photos:[{photoId:'one',albumKey:'alpha',count:2,previousCount:3,difference:-1,lastActivity:null,imageUrl:null}],
  albums:[{albumKey:'alpha',count:5,previousCount:3,difference:2,lastActivity:null,publicationAt:null}],
  albumOnlyActions:[{albumKey:'alpha',count:3,previousCount:0,difference:3,lastActivity:null}]
 });
 const csv=reportCsv(value);
 assert.equal(csv.split('\n').length,3);
 assert.match(csv, /"photo","one","alpha","2","3","-1"/);
 assert.match(csv, /"album_action","","alpha","3"/);
 assert.equal(reportCsv(value,new Set(['missing'])).split('\n').length,1);
});
