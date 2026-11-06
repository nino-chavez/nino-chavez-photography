import assert from 'node:assert/strict';
import test from 'node:test';
import { AUTOMATION_NETWORKS, automationNetworkSignal, labelTrafficByNetwork, labelDevelopmentTraffic, visitorNetwork } from './automation-networks';

test('the networks measured in the November 2026 crawl surge are listed', () => {
	for (const asn of [32934, 24940, 203020, 207990, 136907, 209366, 16276, 20473, 132203])
		assert.ok(automationNetworkSignal({ asn }), `AS${asn}`);
});

test('residential, mobile, privacy and unknown networks are never labelled', () => {
	// Comcast, AT&T, Verizon, T-Mobile, Spectrum, Cloudflare WARP, Apple Private Relay
	for (const asn of [7922, 7018, 701, 21928, 20115, 13335, 714, 36183, 8075, 16509, 14618]) assert.equal(automationNetworkSignal({ asn }), null, `AS${asn}`);
	assert.equal(automationNetworkSignal({}), null);
	assert.equal(automationNetworkSignal(undefined), null);
	assert.equal(automationNetworkSignal({ asn: 'not-a-number' }), null);
	assert.equal(automationNetworkSignal({ asn: null }), null);
});

test('a numeric string ASN from a header-shaped source still matches', () => {
	assert.deepEqual(automationNetworkSignal({ asn: '24940' }), { asn: 24940, network: 'Hetzner' });
});

test('every entry has a name and the list holds only positive integers', () => {
	for (const [asn, name] of Object.entries(AUTOMATION_NETWORKS)) {
		assert.ok(Number.isInteger(Number(asn)) && Number(asn) > 0);
		assert.ok(name.length > 2);
	}
});

test('only audience traffic is relabelled; proven operator, test and self-excluded context stands', () => {
	assert.deepEqual(labelTrafficByNetwork('audience', { asn: 24940 }), { context: 'suspected_automation', signal: { asn: 24940, network: 'Hetzner' } });
	assert.deepEqual(labelTrafficByNetwork('audience', { asn: 7922 }), { context: 'audience', signal: null });
	assert.deepEqual(labelTrafficByNetwork('audience', undefined), { context: 'audience', signal: null });
	for (const proven of ['operator', 'test', 'self_excluded'] as const) assert.deepEqual(labelTrafficByNetwork(proven, { asn: 24940 }), { context: proven, signal: null });
});

test('a dev server on a remote database is test traffic; local databases and production keep audience', () => {
	assert.equal(labelDevelopmentTraffic('audience', true, 'https://abc.supabase.co'), 'test');
	assert.equal(labelDevelopmentTraffic('audience', true, undefined), 'test');
	assert.equal(labelDevelopmentTraffic('audience', true, 'http://127.0.0.1:54321'), 'audience');
	assert.equal(labelDevelopmentTraffic('audience', true, 'http://localhost:54321'), 'audience');
	assert.equal(labelDevelopmentTraffic('audience', false, 'https://abc.supabase.co'), 'audience');
	assert.equal(labelDevelopmentTraffic('operator', true, 'https://abc.supabase.co'), 'operator');
});

test('behind the router the visitor ASN comes from the router header, not request.cf', () => {
	const viaRouter = new Headers({ 'cf-worker': 'ninochavez.co', 'x-nc-client-asn': '24940' });
	assert.deepEqual(visitorNetwork(viaRouter, { asn: 13335 }), { asn: 24940 });
	assert.deepEqual(automationNetworkSignal(visitorNetwork(viaRouter, { asn: 13335 })), { asn: 24940, network: 'Hetzner' });
});

test('router request without a usable header, or from another zone, has no trusted network', () => {
	assert.equal(visitorNetwork(new Headers({ 'cf-worker': 'ninochavez.co' }), { asn: 24940 }), null);
	assert.equal(visitorNetwork(new Headers({ 'cf-worker': 'ninochavez.co', 'x-nc-client-asn': 'abc' }), { asn: 24940 }), null);
	assert.equal(visitorNetwork(new Headers({ 'cf-worker': 'other.example', 'x-nc-client-asn': '24940' }), { asn: 24940 }), null);
});

test('a direct hit (no CF-Worker header) uses its own cf and ignores the router header', () => {
	const direct = new Headers({ 'x-nc-client-asn': '24940' });
	assert.deepEqual(visitorNetwork(direct, { asn: 7922 }), { asn: 7922 });
	assert.equal(automationNetworkSignal(visitorNetwork(direct, { asn: 7922 })), null);
	assert.deepEqual(visitorNetwork(new Headers(), { asn: 24940 }), { asn: 24940 });
});
