import assert from 'node:assert/strict';
import test from 'node:test';
import { parseIntelligencePreferences, RECAP_SCHEDULE_COPY, recapSettingsLines, retentionDays, type IntelligencePreferences } from './intelligence-preferences';

const prefs = (over: Partial<IntelligencePreferences> = {}): IntelligencePreferences => ({ retention: '90_days', externalEnabled: false, destination: null, destinationVerified: false, ...over });

test('the form saves one thing, how long private records are kept; the old daily and weekly fields are refused, not ignored', () => {
	assert.deepEqual(parseIntelligencePreferences({ retention: 'one_year' }), { retention: 'one_year' });
	assert.deepEqual(parseIntelligencePreferences({ retention: 'until_deleted' }), { retention: 'until_deleted' });
	assert.equal(parseIntelligencePreferences({ retention: '90_days', daily: true, weekly: false }), null);
	assert.equal(parseIntelligencePreferences({ retention: '90_days', daily: true }), null);
	assert.equal(parseIntelligencePreferences({ retention: 'undecided' }), null);
	assert.equal(parseIntelligencePreferences({ retention: 'forever' }), null);
	assert.equal(parseIntelligencePreferences({}), null);
	assert.equal(parseIntelligencePreferences(null), null);
	assert.equal(parseIntelligencePreferences([{ retention: '90_days' }]), null);
	assert.deepEqual(['until_deleted', '90_days', 'one_year', 'undecided'].map((retention) => retentionDays(retention as never)), [null, 90, 365, null]);
});

test('the recap settings copy: the schedule, whether recaps are written, and what email will and will not do', () => {
	assert.equal(RECAP_SCHEDULE_COPY, 'Each album gets a recap on day 3 and day 7 after it is first public, at 8:00 AM Chicago time.');
	const undecided = recapSettingsLines(prefs({ retention: 'undecided' }));
	assert.equal(undecided.schedule, RECAP_SCHEDULE_COPY);
	assert.equal(undecided.storage, 'No recap is being written yet. Recaps are written for you once you choose how long to keep private records. A recap that came due before then is not written later.');
	assert.equal(undecided.email, 'Email is off, so no recap is emailed. There is no verified address yet.');
	const chosen = recapSettingsLines(prefs());
	assert.equal(chosen.storage, 'Recaps are written for you and listed on each album report, under Recaps. Only a complete one can be emailed.');
	assert.equal(chosen.email, 'Email is off, so no recap is emailed. There is no verified address yet.');
	assert.equal(recapSettingsLines(prefs({ destinationVerified: true, destination: 'a@example.test' })).email, 'Email is off, so no recap is emailed.');
	const on = recapSettingsLines(prefs({ externalEnabled: true, destinationVerified: true, destination: 'a@example.test' }));
	assert.equal(on.email, 'Email is on for a@example.test. Only a complete recap is emailed; an incomplete one stays in the dashboard. Nothing is sent from this page.');
	assert.equal(recapSettingsLines(prefs({ externalEnabled: true })).email, 'Email is on but has no verified address, so no recap is emailed.');
});

test('unreadable settings are said as unreadable, and no line claims a send or a daily or weekly review', () => {
	const unknown = recapSettingsLines(null);
	assert.equal(unknown.storage, 'Whether recaps are being written could not be read.');
	assert.equal(unknown.email, 'Whether recap email is on could not be read.');
	for (const state of [null, prefs(), prefs({ retention: 'undecided' }), prefs({ externalEnabled: true, destinationVerified: true, destination: 'a@example.test' })]) {
		const lines = recapSettingsLines(state);
		for (const line of Object.values(lines)) {
			assert.doesNotMatch(line, /\b(daily|weekly)\b/i, line);
			assert.doesNotMatch(line, /\b(was|were|has been|have been) (sent|emailed|delivered)\b/i, line);
		}
	}
});
