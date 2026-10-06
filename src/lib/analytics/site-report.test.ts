import assert from 'node:assert/strict';
import test from 'node:test';
import type { SiteActionReport } from './site-actions';
import { pageLabel, pagesFor, providerFix, referrersFor, sectionCards, siteLead, todayLine, windowNote } from './site-report';
import { clickReading, reachReading } from './site-readings';
import { summarizeSiteTraffic, type SiteTrafficReport } from './site-traffic.server';

/*
 * Fixtures follow production on 2026-10-06: 730 page loads over 30 days, collection of clicks since
 * Sep 29, no contact clicks and 3 outbound clicks, and a 7-day window of Sep 29 to Oct 5.
 */
const TODAY = '2026-10-06';
const REFRESHED_AT = '2026-10-06T14:40:00Z';
function row(date: string, requestPath: string, count: number, visits: number, refererHost = '') {
	return { count, dimensions: { date, requestPath, refererHost, deviceType: 'desktop' }, sum: { visits } };
}

const traffic: SiteTrafficReport = summarizeSiteTraffic([
	row('2026-10-01', '/', 40, 10, 'linkedin.com'),
	row('2026-10-02', '/blog/post-one', 30, 6, 'news.example'),
	row('2026-10-02', '/demos/demo-one', 20, 4, 'linkedin.com'),
	row('2026-10-03', '/photography/albums/Re7kho', 100, 30, 'instagram.com'),
	row('2026-10-03', '/privacy', 5, 1),
	row('2026-10-04', '/work', 15, 3, 'ninochavez.co')
], 7, '2026-09-29', '2026-10-05', [row('2026-09-24', '/', 100, 20)], '2026-10-06T14:00:00Z');

function actions(over: Partial<Extract<SiteActionReport, { available: true }>> = {}): SiteActionReport {
	return {
		available: true, start: '2026-09-29', end: '2026-10-05', firstRecordedAt: '2026-09-29T05:00:00Z', excludedEvents: 0,
		totals: { contact_clicks: 0, external_clicks: 3, page_views: 85 }, todayTotals: {}, previousTotals: { contact_clicks: 0, external_clicks: 0 },
		recordedSections: ['profile', 'writing'], page: 0, pageCount: 1, pages: [],
		freshness: { status: 'current', refreshedAt: '2026-10-06T14:00:00Z', summaryCutoffAt: '2026-10-06T14:00:00Z', lastFailureAt: null, todayAvailable: true, completedThrough: '2026-10-05' },
		...over
	};
}

test('the lead says what each number is and what it is compared with', () => {
	const lead = siteLead({ traffic, actions: actions(), period: 7, section: 'all', today: TODAY });
	assert.equal(lead.reach.label, 'Page loads on ninochavez.co (Cloudflare)');
	assert.equal(lead.reach.value, '210');
	assert.match(lead.reach.detail, /^Sep 29 – Oct 5, up 110% from 100 in the 7 days before\./);
	assert.match(lead.reach.detail, /Includes the photography pages/);
	// Clicks begin on Sep 29, which is the first day of this window, so they count; the 7 days before them were not counted.
	assert.equal(lead.contacts.value, '0');
	assert.match(lead.contacts.detail, /nothing to compare it with\. These are links opened, not messages sent\.$/);
	assert.equal(lead.outbound.value, '3');
	assert.match(lead.outbound.detail, /not visits that happened/);
});

test('clicks say since when they are counted, never zero, when the window starts before collection', () => {
	const thirty = actions({ start: '2026-09-06', end: '2026-10-05' });
	const lead = siteLead({ traffic, actions: thirty, period: 30, section: 'all', today: TODAY });
	assert.equal(lead.contacts.value, null);
	assert.equal(lead.contacts.detail, 'Link clicks have been counted since Sep 29, so there is no full 30 days to count yet. Choose 7 days to see them.');
	assert.equal(lead.outbound.value, null);
	// Never started counting: the page says so and says it is not zero.
	const none = siteLead({ traffic, actions: actions({ firstRecordedAt: null, recordedSections: [] }), period: 7, section: 'all', today: TODAY });
	assert.equal(none.contacts.value, null);
	assert.match(none.contacts.detail, /not been counted yet.*not zero/);
	// A read that failed is not a quiet week.
	const failed = siteLead({ traffic, actions: null, period: 7, section: 'all', today: TODAY });
	assert.equal(failed.contacts.value, null);
	assert.match(failed.contacts.detail, /not a report of zero/);
});

test('a comparison is stated only when the week before was counted', () => {
	const both = siteLead({ traffic, actions: actions({ firstRecordedAt: '2026-09-20T00:00:00Z', totals: { contact_clicks: 4, external_clicks: 2 }, previousTotals: { contact_clicks: 2, external_clicks: 2 } }), period: 7, section: 'all', today: TODAY });
	assert.match(both.contacts.detail, /^Sep 29 – Oct 5, against 2 in the 7 days before\./);
	assert.match(both.outbound.detail, /^Sep 29 – Oct 5, the same as 2 in the 7 days before\./);
});

test('a stale summary is said next to the figure', () => {
	const stale = actions({ freshness: { status: 'stale', refreshedAt: '2026-10-05T03:00:00Z', summaryCutoffAt: '2026-10-05T03:00:00Z', lastFailureAt: null, todayAvailable: false, completedThrough: '2026-10-04' } });
	const lead = siteLead({ traffic, actions: stale, period: 7, section: 'all', today: TODAY });
	assert.match(lead.contacts.detail, /catching up/);
});

test('Cloudflare unavailable says what that means and what to do, and shows no number', () => {
	const down = siteLead({ traffic: { available: false, period: 7, reason: 'Cloudflare Web Analytics could not be read. No traffic total is shown.' }, actions: actions(), period: 7, section: 'all', today: TODAY });
	assert.equal(down.reach.value, null);
	assert.match(down.reach.detail, /could not be read\. No traffic total is shown\. This is not zero\. Reload in a few minutes\./);
	const unset = siteLead({ traffic: { available: false, period: 7, reason: 'Cloudflare Web Analytics access is not configured for this report.' }, actions: actions(), period: 7, section: 'all', today: TODAY });
	assert.match(unset.reach.detail, /no Cloudflare access set up here/);
	assert.equal(providerFix('not configured'), providerFix('Cloudflare Web Analytics access is not configured for this report.'));
	assert.equal(siteLead({ traffic: null, actions: null, period: 7, section: 'all', today: TODAY }).reach.value, null);
});

test('photography is pointed at the gallery numbers instead of showing a competing page-load figure', () => {
	const lead = siteLead({ traffic, actions: actions(), period: 7, section: 'photography', today: TODAY });
	assert.equal(lead.reach.value, null);
	assert.match(lead.reach.detail, /Home and Albums count the gallery itself/);
	const cards = sectionCards(traffic);
	const photography = cards.find((card) => card.key === 'photography')!;
	assert.deepEqual([photography.pageLoads, photography.entryVisits, photography.pointsToGallery], [null, null, true]);
	assert.deepEqual(cards.filter((card) => card.key !== 'photography').map((card) => [card.key, card.pageLoads]), [['profile', 55], ['writing', 30], ['demos', 20], ['other', 5]]);
	// The lists leave the gallery's pages out too; the total still includes them.
	assert.equal(pagesFor(traffic, 'all').some((page) => page.path.startsWith('/photography')), false);
	assert.deepEqual(pagesFor(traffic, 'photography'), []);
	assert.deepEqual(referrersFor(traffic, 'photography'), []);
	assert.equal(referrersFor(traffic, 'all').some((ref) => ref.host === 'instagram.com'), false);
	assert.equal(traffic.pageviews, 210);
});

test('a single section shows its own page loads and says it has nothing to compare with', () => {
	const lead = siteLead({ traffic, actions: actions(), period: 7, section: 'writing', today: TODAY });
	assert.equal(lead.reach.value, '30');
	assert.match(lead.reach.detail, /Writing only\. The 7 days before are measured for the whole site, so this section has nothing to compare it with\.$/);
});

test('entry sources merge across sections, sort by entry visits and drop the site itself', () => {
	assert.deepEqual(referrersFor(traffic, 'all'), [{ host: 'linkedin.com', entryVisits: 14 }, { host: 'news.example', entryVisits: 6 }, { host: 'Direct / unknown', entryVisits: 1 }]);
	assert.deepEqual(referrersFor(traffic, 'demos'), [{ host: 'linkedin.com', entryVisits: 4 }]);
});

test('page labels and the window note', () => {
	assert.equal(pageLabel('/'), 'Home');
	assert.equal(pageLabel('/blog/my-first-post'), 'blog / my first post');
	assert.equal(pageLabel('/blog/%E0%A4%A'), '/blog/%E0%A4%A');
	assert.match(windowNote(traffic, 7, TODAY), /^Sep 29 – Oct 5, complete UTC days\. Page loads are Cloudflare's count with known bots removed\./);
	assert.equal(windowNote(null, 30, TODAY), 'The last 30 complete UTC days.');
});

test('the shared readings are the ones Home uses', () => {
	assert.deepEqual(clickReading(actions(), 'contact_clicks', 7), { available: true, start: '2026-09-29', end: '2026-10-05', current: 0, previous: null });
	assert.deepEqual(clickReading(actions(), 'external_clicks', 7), { available: true, start: '2026-09-29', end: '2026-10-05', current: 3, previous: null });
	assert.equal(clickReading({ available: false, reason: 'down' }, 'contact_clicks', 7).available, false);
	assert.deepEqual(reachReading(traffic), { available: true, start: '2026-09-29', end: '2026-10-05', current: 210, previous: 100 });
	assert.equal(reachReading(null).available, false);
});

test('a change is a percentage only when both periods have at least 20; below that the two counts are stated plainly', () => {
	const counted = (current: number, previous: number) => actions({ firstRecordedAt: '2026-09-20T00:00:00Z', totals: { contact_clicks: current, external_clicks: 0 }, previousTotals: { contact_clicks: previous, external_clicks: 0 } });
	const detail = (current: number, previous: number) => siteLead({ traffic, actions: counted(current, previous), period: 7, section: 'all', today: TODAY }).contacts.detail;
	assert.match(detail(4, 2), /^Sep 29 – Oct 5, against 2 in the 7 days before\. /);
	assert.match(detail(25, 19), /^Sep 29 – Oct 5, against 19 in the 7 days before\. /);
	assert.match(detail(19, 25), /^Sep 29 – Oct 5, against 25 in the 7 days before\. /);
	assert.match(detail(3, 0), /^Sep 29 – Oct 5, against 0 in the 7 days before\. /);
	assert.match(detail(30, 20), /^Sep 29 – Oct 5, up 50% from 20 in the 7 days before\. /);
	assert.match(detail(20, 40), /^Sep 29 – Oct 5, down 50% from 40 in the 7 days before\. /);
	assert.match(detail(5, 5), /^Sep 29 – Oct 5, the same as 5 in the 7 days before\. /);
	// Cloudflare page loads follow the same rule: 130 against 100 is a percentage, 12 against 9 is not.
	const reach = (now: number, before: number) => summarizeSiteTraffic([row('2026-10-01', '/', now, 1)], 7, '2026-09-29', '2026-10-05', [row('2026-09-24', '/', before, 1)], '2026-10-06T14:00:00Z');
	assert.match(siteLead({ traffic: reach(130, 100), actions: actions(), period: 7, section: 'all', today: TODAY }).reach.detail, /up 30% from 100/);
	assert.match(siteLead({ traffic: reach(12, 9), actions: actions(), period: 7, section: 'all', today: TODAY }).reach.detail, /against 9 in the 7 days before/);
});

test('today so far is one line kept apart from every total, and is silent when it has nothing honest to say', () => {
	const open = actions({ todayTotals: { contact_clicks: 1, external_clicks: 2 } });
	assert.equal(todayLine(open, TODAY), 'Today so far, kept apart from every number above: 1 contact link and 2 outbound links clicked, through 9:00 AM Chicago time.');
	assert.match(todayLine(actions({ todayTotals: {} }), TODAY)!, /0 contact links and 0 outbound links clicked/);
	// No reading for today, counting not started, or nothing read: nothing is said.
	assert.equal(todayLine(actions({ freshness: { status: 'current', refreshedAt: REFRESHED_AT, summaryCutoffAt: REFRESHED_AT, lastFailureAt: null, todayAvailable: false, completedThrough: '2026-10-05' } }), TODAY), null);
	assert.equal(todayLine(actions({ firstRecordedAt: null, recordedSections: [] }), TODAY), null);
	assert.equal(todayLine({ available: false, reason: 'down' }, TODAY), null);
	assert.equal(todayLine(null, TODAY), null);
	// Today is not in the lead's figures.
	const lead = siteLead({ traffic, actions: open, period: 7, section: 'all', today: TODAY });
	assert.equal(lead.contacts.value, '0');
	assert.equal(lead.outbound.value, '3');
});
