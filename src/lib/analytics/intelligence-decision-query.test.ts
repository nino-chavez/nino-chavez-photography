import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGalleryDecisionQuery, parseGalleryDecisionEvidence } from './posthog-queries.server';
const columns=['row_kind','album_key','photo_id','exposures','favorites','download_items','responses','opens','direct_entries','rendered','failed','observed_terminal','submitted','search_failed'];
const query={start:'2026-09-01',end:'2026-09-28'};
test('strong photo response uses named actions after exposure; hidden albums and target slices stay bounded',()=>{
 const built=buildGalleryDecisionQuery(query,['public-album'])!;
 assert.match(built.query,/event IN \('favorite_added','download_item_requested'\)/);
 assert.match(built.query,/timestamp > photo_exposed_at/);
 assert.match(built.query,/album_key IN \('public-album'\)/);
 assert.match(built.query,/latest_classifications/);
 assert.equal(buildGalleryDecisionQuery({...query,albumKeys:['hidden']},['public-album']),null);
 assert.equal(buildGalleryDecisionQuery({...query,start:'2026-02-30'},['public-album']),null);
});
test('same-visit response is a union, not favorite-plus-download counts',()=>{
 const value={columns,results:[['photo','public-album','photo-1',25,5,5,5,0,0,0,0,0,0,0],['diagnostics','','',0,0,0,0,0,0,80,2,81,10,1]]};
 const parsed=parseGalleryDecisionEvidence(value,'2026-09-29T01:00:00Z',false)!;
 assert.equal(parsed.photoResponses[0].responses,5);
 assert.deepEqual(parsed.rendering,{rendered:80,failed:2,observedTerminal:81});
 assert.deepEqual(parsed.search,{submitted:10,failed:1});
 assert.equal(parseGalleryDecisionEvidence(value,'2026-09-29T01:00:00Z',true)!.search,null);
 value.results[0][6]=26;
 assert.equal(parseGalleryDecisionEvidence(value,'2026-09-29T01:00:00Z',false),null);
});
