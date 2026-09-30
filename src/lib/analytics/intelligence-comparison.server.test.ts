import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAlbumComparison, comparableAlbums, projectAlbumComparison } from './intelligence-comparison.server';

test('album comparison uses only matching known facts and excludes hidden or incomplete candidates', () => {
	const result = comparableAlbums({ album_key: 'target', sport: 'volleyball', event_type: 'tournament', event_date: '2026-05-10', division: 'girls', level: 'club' }, [
		{ album_key: 'target', sport: 'volleyball', event_type: 'tournament', event_date: '2026-05-10', division: 'girls', level: 'club' },
		{ album_key: 'match', sport: 'volleyball', event_type: 'tournament', event_date: '2026-02-02', division: 'girls', level: 'club' },
		{ album_key: 'hidden', sport: 'volleyball', event_type: 'tournament', event_date: '2026-02-02', division: 'girls', level: 'club', visibility: 'unlisted' },
		{ album_key: 'unknown', sport: null, event_type: 'tournament', event_date: null, division: null, level: null }
	]);
	assert.deepEqual(result.comparableAlbumKeys, ['match']);
	assert.equal(result.excluded.hidden, 1);
	assert.equal(result.excluded.missingKnownFacts, 1);
});

test('calculation reads bounded calendar and publication-age reports and reports values without ranking a weak peer sample', async () => {
	const target = { album_key: 'target', album_name: 'Target Album', sport: 'volleyball', event_type: 'tournament', event_date: '2026-05-10', division: 'girls', level: 'club' };
	const peer = { album_key: 'peer', album_name: 'Peer Album', sport: 'volleyball', event_type: 'tournament', event_date: '2026-02-02', division: 'girls', level: 'club' };
	let fromCount = 0;
	const chain = (value: unknown) => ({ select: () => chain(value), eq: () => chain(value), neq: () => chain(value), gte: () => chain(value), lte: () => chain(value), order: () => chain(value), limit: () => chain(value), in: () => chain(value), maybeSingle: async () => value, then: (resolve: (v: unknown) => unknown) => Promise.resolve(value).then(resolve) });
	const client = { from: (table: string) => { fromCount += 1; return chain(table === 'albums' && fromCount === 1 ? { data: target, error: null } : table === 'albums' ? { data: [peer], error: null } : { data: [{ album_key: 'target', visibility: 'public' }, { album_key: 'peer', visibility: 'public' }], error: null }); } } as any;
	const scope = { kind: 'gallery' as const, query: { start: '2026-09-01', end: '2026-09-30', measure: 'photo_opens' as const, scope: 'album' as const, albumKeys: ['target'], compare: 'previous' as const, traffic: 'conservative' as const } };
	const result = await calculateAlbumComparison(client, scope, { loadReport: async (_client, query) => {
		assert.deepEqual(query.albumKeys, ['target', 'peer']);
		assert.equal(query.scope, 'selected');
		assert.ok(['previous', 'publication_age'].includes(query.compare));
		return { coverage: 'complete', previousCoverage: 'complete', albums: [{ albumKey: 'target', count: 12, previousCount: 9 }, { albumKey: 'peer', count: 10, previousCount: 8 }], publicationAge: { available: false, days: 30, albums: [] } };
	} });
	assert.equal(result.target?.current, 12);
	assert.equal(result.median, 10);
	assert.equal(result.sampleSize, 1);
	assert.match(result.reason ?? '', /Fewer than three complete public peers/);
	assert.match(result.target?.href ?? '', /^\/albums\/target-album-target$/);
	assert.equal(fromCount, 3);
});


test('saved comparison rechecks visibility and facts and replaces stored unsafe links',async()=>{
 const scope={kind:'gallery' as const,query:{start:'2026-09-01',end:'2026-09-30',measure:'photo_opens' as const,scope:'album' as const,albumKeys:['target'],compare:'previous' as const,traffic:'conservative' as const}};
 const facts=[{album_key:'target',album_name:'Target',sport:'volleyball',event_type:'tournament',event_date:null,division:null,level:null},{album_key:'peer',album_name:'Peer',sport:'volleyball',event_type:'tournament',event_date:null,division:null,level:null}];
 let hidden=false;let changed=false;
 const client={from:(table:string)=>({select:()=>({in:async()=>({data:table==='albums'?facts.map(f=>changed&&f.album_key==='peer'?{...f,sport:'soccer'}:f):hidden?[{album_key:'peer',visibility:'unlisted'}]:[],error:null})})})} as any;
 const saved={available:true,criteria:['sport = volleyball','event type = tournament'],target:{albumKey:'target',current:30,previous:20,href:'https://attacker.invalid'},peers:[{albumKey:'peer',current:22,previous:21,href:'//attacker.invalid'}],units:'photo_opens',coverage:{current:'complete',previous:'complete'},windows:{current:{start:'2026-09-01',end:'2026-09-30'}}};
 const result=await projectAlbumComparison(client,scope,saved);assert.equal(result.available,true);assert.equal(result.target?.href,'/albums/target-target');assert.equal(result.median,22);
 hidden=true;assert.equal((await projectAlbumComparison(client,scope,saved)).available,false);hidden=false;changed=true;assert.equal((await projectAlbumComparison(client,scope,saved)).available,false);
 assert.equal((await projectAlbumComparison(client,scope,{...saved,units:'downloads'})).available,false);
 assert.equal((await projectAlbumComparison(client,scope,{...saved,peers:[saved.target]})).available,false);
});
