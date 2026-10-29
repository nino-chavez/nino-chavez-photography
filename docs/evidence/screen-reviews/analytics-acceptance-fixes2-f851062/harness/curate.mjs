// Picks the committed subset from the full capture set. usage: node curate.mjs <fullDir> <outDir> <q2x> <qOther>
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync, utimesSync } from 'node:fs';
import { require } from './gates.mjs';
const sharp = require('sharp');
const [FULL, OUT, Q2X = '48', QO = '55'] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const files = readdirSync(FULL).filter((f) => f.endsWith('.jpg'));
const pick = (f) => {
	const [surface, role, engine, width, setting, part] = f.replace('.jpg', '').split('__');
	if (engine === 'chromium' && setting === 'default') return true;
	if (engine === 'chromium' && width === 'phone-390' && setting === 'text-200') return true;
	if (engine === 'chromium' && width === 'phone-390' && role === 'visitor' && ['contrast-more', 'forced-colors'].includes(setting) && part.startsWith('p01of')) return true;
	if (engine === 'webkit' && width === 'phone-390' && role === 'visitor' && setting === 'default') return true;
	return false;
};
let before = 0; let after = 0; let n = 0;
for (const f of files.filter(pick)) {
	const buf = readFileSync(`${FULL}/${f}`); before += buf.length;
	const meta = await sharp(buf).metadata();
	const q = meta.width === 780 ? Number(Q2X) : Number(QO);
	const out = await sharp(buf).jpeg({ quality: q, mozjpeg: true }).toBuffer();
	writeFileSync(`${OUT}/${f}`, out);
	const m = statSync(`${FULL}/${f}`).mtime; utimesSync(`${OUT}/${f}`, m, m);
	after += out.length; n += 1;
}
console.log(`picked ${n} of ${files.length}: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
