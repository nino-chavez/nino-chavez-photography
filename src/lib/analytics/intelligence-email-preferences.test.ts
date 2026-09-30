import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { emailIntelligenceDeliveryConfigured, emailIntelligenceDeliveryState, parseEmailIntelligenceDeliveryChange, validEmailIntelligenceDeliveryState } from './intelligence-email-preferences';

const email = 'owner@example.invalid';

test('email delivery state accepts only the confirmed owner destination and complete stored evidence', () => {
	const state = emailIntelligenceDeliveryState({
		external_enabled: true, destination_verified: true, destination_verified_at: '2026-09-30T14:00:00.000Z',
		destination: email, sender: 'owned', retention_policy: 'days'
	}, email, true);
	assert.deepEqual(state, { enabled: true, configured: true, retentionChosen: true, destination: email, emailVerified: true });
	assert.equal(emailIntelligenceDeliveryState({ external_enabled: true, destination_verified: true, destination_verified_at: '2026-09-30T14:00:00.000Z', destination: 'elsewhere@example.invalid', sender: 'owned', retention_policy: 'days' }, email, true).enabled, false);
	assert.equal(emailIntelligenceDeliveryState({ external_enabled: true, destination_verified: true, destination_verified_at: 'not-a-date', destination: email, sender: 'posthog_native', retention_policy: 'days' }, email, true).enabled, false);
});

test('GET response shape and activation controls fail closed', () => {
	assert.equal(validEmailIntelligenceDeliveryState({ enabled: false, configured: false, retentionChosen: false, destination: null, emailVerified: false }), true);
	assert.equal(validEmailIntelligenceDeliveryState({ enabled: false, configured: false, retentionChosen: false, destination: null, emailVerified: false, email: email }), false);
	assert.deepEqual(parseEmailIntelligenceDeliveryChange({ enabled: true, confirm: 'activate_verified_email' }), { enabled: true, confirm: 'activate_verified_email' });
	assert.deepEqual(parseEmailIntelligenceDeliveryChange({ enabled: false, confirm: 'disable_email' }), { enabled: false, confirm: 'disable_email' });
	assert.equal(parseEmailIntelligenceDeliveryChange({ enabled: true, confirm: 'disable_email' }), null);
	assert.equal(parseEmailIntelligenceDeliveryChange({ enabled: true, confirm: 'activate_verified_email', destination: email }), null);
	assert.equal(emailIntelligenceDeliveryConfigured({ enabled: 'true', from: 'Reports <reports@example.invalid>', token: 'token' }), true);
	assert.equal(emailIntelligenceDeliveryConfigured({ enabled: 'false', from: 'Reports <reports@example.invalid>', token: 'token' }), false);
});

test('delivery route keeps owner, origin, configuration, and client-identity gates in source', () => {
	const route = readFileSync('src/routes/api/analytics/intelligence/delivery/+server.ts', 'utf8');
	assert.match(route, /intelligenceOwner\(cookies\)/);
	assert.match(route, /createSupabaseServerClient\(cookies\)\.auth\.getUser\(\)/);
	assert.match(route, /request\.headers\.get\('origin'\)/);
	assert.match(route, /parseEmailIntelligenceDeliveryChange/);
	assert.match(route, /emailIntelligenceDeliveryConfigured/);
	assert.match(route, /sender: 'owned'/);
	assert.doesNotMatch(route, /body\.(?:email|destination)/);
});
