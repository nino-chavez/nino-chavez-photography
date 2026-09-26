import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasGainMap, readSdrCrsSettings, formatDriftWarning, SDR_DRIFT_THRESHOLD } from './hdr-gainmap';

test('hasGainMap detects the hdrgm XMP namespace string in raw bytes', () => {
	const withGainMap = Buffer.from('...garbage...http://ns.adobe.com/hdr-gain-map/1.0/...more...', 'latin1');
	assert.equal(hasGainMap(withGainMap), true);
});

test('hasGainMap returns false for a plain JPEG with no gain-map namespace', () => {
	const plain = Buffer.from('\xff\xd8\xff\xe0JFIF...no hdr metadata here...\xff\xd9', 'latin1');
	assert.equal(hasGainMap(plain), false);
});

test('readSdrCrsSettings extracts crs:SDR* attributes from an embedded XMP packet', () => {
	const xmp =
		'<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF><rdf:Description ' +
		'crs:SDRBrightness="+97" crs:SDRContrast="-36" crs:SDRClarity="-22" ' +
		'crs:Other="ignored-not-sdr-prefixed" /></rdf:RDF></x:xmpmeta>';
	const buf = Buffer.from(`junkbefore${xmp}junkafter`, 'latin1');
	const settings = readSdrCrsSettings(buf);
	assert.deepEqual(settings, { SDRBrightness: 97, SDRContrast: -36, SDRClarity: -22 });
});

test('readSdrCrsSettings returns null when there is no xmpmeta packet at all', () => {
	assert.equal(readSdrCrsSettings(Buffer.from('no xmp here', 'latin1')), null);
});

test('readSdrCrsSettings returns null when the xmpmeta packet has no SDR* attributes', () => {
	const xmp = '<x:xmpmeta><rdf:Description crs:Contrast2012="-40" /></x:xmpmeta>';
	assert.equal(readSdrCrsSettings(Buffer.from(xmp, 'latin1')), null);
});

test('formatDriftWarning names the threshold and the offending SDR settings', () => {
	const msg = formatDriftWarning('DSC09484.jpg', { stdLog2Gain: 1.11, meanLog2Gain: -0.39, spread: 3.72 }, {
		SDRBrightness: 97,
		SDRContrast: -36
	});
	assert.match(msg, /DSC09484\.jpg/);
	assert.match(msg, new RegExp(`threshold ${SDR_DRIFT_THRESHOLD}`));
	assert.match(msg, /SDRBrightness=\+97/);
	assert.match(msg, /SDRContrast=-36/);
});

test('formatDriftWarning names the absence of settings when the file has no readable XMP', () => {
	const msg = formatDriftWarning('unknown.jpg', { stdLog2Gain: 1.0, meanLog2Gain: 0, spread: 2 }, null);
	assert.match(msg, /no XMP-crs SDR\* settings found/);
});
