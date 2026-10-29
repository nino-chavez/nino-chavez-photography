// Builds captures/index.md and the data tables of mechanical.md from the run directories.
// usage: node report.mjs <captureFolder> <tablesOut> <runDir...>
import { readFileSync, readdirSync, writeFileSync, existsSync, statSync } from 'node:fs';
const [CAPDIR, TABLES, ...RUNS] = process.argv.slice(2);
const S = '/private/tmp/claude-501/-Users-nino-Workspace-dev-sites-nino-nino-chavez-photography/ddb351f2-02c9-4391-86b5-2ad4de086841/scratchpad/s9/';
const byKey = new Map();
for (const r of RUNS) for (const f of readdirSync(`${S}${r}/mech`)) for (const line of readFileSync(`${S}${r}/mech/${f}`, 'utf8').split('\n').filter(Boolean)) { const x = JSON.parse(line); byKey.set(`${x.surface}|${x.role}|${x.engine.split(' ')[0]}|${x.width}`, x); } // a later run replaces the same load from an earlier one
const recs = [...byKey.values()];
const ORDER = ['home', 'albums', 'album-Re7kho', 'album-DWdCET', 'album-Re7kho-recap3', 'album-Re7kho-recap7', 'album-DWdCET-recap3', 'album-DWdCET-recap7', 'album-Re7kho-recap5', 'photos', 'sites', 'data', 'settings'];
const SETORDER = ['default', 'contrast-more', 'forced-colors', 'forced-colors-query-only', 'dark', 'text-200', 'text-312'];
const eng = (r) => r.engine.split(' ')[0];
recs.sort((a, b) => ORDER.indexOf(a.surface) - ORDER.indexOf(b.surface) || a.role.localeCompare(b.role) || eng(a).localeCompare(eng(b)) || a.width.localeCompare(b.width));

// ---------- index.md ----------
const files = readdirSync(CAPDIR).filter((f) => f.endsWith('.jpg'));
const COMMITTED = process.env.COMMITTED === '1'; const FULLPATH = process.env.FULLPATH ?? '';
const rows = []; const missing = [];
for (const r of recs) {
	for (const [sid, st] of Object.entries(r.settings)) {
		const setting = sid === 'forced-colors' && eng(r) === 'webkit' ? 'forced-colors-query-only' : sid;
		if (st.files?.length) {
			st.files.forEach((f, i) => rows.push({ f, surface: r.surface, role: r.role, engine: eng(r), width: r.width, setting, part: `${i + 1} of ${st.parts}`, y: st.partOffsets?.[i], height: st.height, at: (st.capturedAt ?? '').replace('T', ' ').slice(0, 19) }));
		} else if (st.error) missing.push(`${r.surface} | ${r.role} | ${eng(r)} | ${r.width} | ${sid} | gate or capture error: ${st.error}`);
		else if (st.identicalToDefault) missing.push(`${r.surface} | ${r.role} | ${eng(r)} | ${r.width} | ${setting} | no file: render matches default (largest channel difference ${st.diffFromDefault?.maxDiff}; pixels differing by more than 12: ${st.diffFromDefault?.pixelsOver12} of ${st.diffFromDefault?.pixelsCompared}; the limit for a match is 0.02%${st.reclassified ? `; ${st.reclassified}` : ''})`);
		else if (st.captured === false) missing.push(`${r.surface} | ${r.role} | ${eng(r)} | ${r.width} | ${sid} | no file: not stored for this engine (gates ran)`);
	}
}
if (COMMITTED) { for (let i = rows.length - 1; i >= 0; i -= 1) if (!files.includes(rows[i].f)) rows.splice(i, 1); }
rows.sort((a, b) => ORDER.indexOf(a.surface) - ORDER.indexOf(b.surface) || a.role.localeCompare(b.role) || a.engine.localeCompare(b.engine) || a.width.localeCompare(b.width) || SETORDER.indexOf(a.setting) - SETORDER.indexOf(b.setting) || a.f.localeCompare(b.f));
const unlisted = files.filter((f) => !rows.some((r) => r.f === f));
const listedMissingOnDisk = rows.filter((r) => !files.includes(r.f));
const kb = (f) => Math.round(statSync(`${CAPDIR}/${f}`).size / 1024);
let idx = `# Capture index\n\n`;
idx += `Files: ${rows.length}. Folder size: ${(rows.reduce((n, r) => n + (existsSync(`${CAPDIR}/${r.f}`) ? statSync(`${CAPDIR}/${r.f}`).size : 0), 0) / 1e6).toFixed(1)} MB.\n\n`;
if (COMMITTED) idx += `This is the committed subset. The full set (every surface, role, engine, width and setting, including WebKit and the 312% text size) is at \`${FULLPATH}\` with its own index.md. The subset holds: Chromium at default settings, every surface, both roles, phone and desktop; Chromium phone at 200% text, both roles; one Chromium phone frame (part 1) per surface at contrast-more and at forced-colors, visitor role; WebKit phone at default settings, every surface, visitor role. Phone default frames are stored at 2x and re-encoded at a lower quality than the full set; the rest are stored at 1x.\n\n`;
idx += `File name pattern: surface__role__engine__width__setting__partNofM.jpg. Every part is one viewport-height screenshot taken after scrolling; the last part is scrolled to the bottom of the page, so it may overlap the part before it. "y" is the scroll offset in CSS pixels; "page height" is the document height in CSS pixels at that setting.\n\n`;
idx += `Both roles in this set come from one local server (a development build of the branch under review) reading production data read-only. The server has no Cloudflare Web Analytics or PostHog credentials. On Home, the site report and data quality it therefore shows "not configured" or "could not be read" where production shows Cloudflare page loads or what visitors did after arriving, and those three pages differ in length from production for that reason. The visitor role sends no sign-in; the owner role is a harness owner, not a real sign-in. Signed-in extras (forms, shortlist, notes) are real owner-only content. The launch findings on Home and on the album reports (the cards under \"Worth your attention\" and the one-line next step under an album's headline) are the findings the real rules compute at capture time, served by a read-only dry run of the next scheduled refresh in place of the stored snapshot's text, because a stored snapshot only changes when the scheduled job writes a new one (see mechanical.md). Stored recap text is shown as stored.\n\n`;
idx += `| file | surface | role | engine | width | setting | part | y | page height | captured (UTC) |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
for (const r of rows) idx += `| ${r.f} | ${r.surface} | ${r.role} | ${r.engine} | ${r.width} | ${r.setting} | ${r.part} | ${r.y} | ${r.height} | ${r.at} |\n`;
idx += `\n## Settings with no file\n\nsurface | role | engine | width | setting | reason\n\n`;
idx += missing.map((m) => `- ${m}`).join('\n') + '\n';
if (unlisted.length || listedMissingOnDisk.length) idx += `\n## Index check\n\nfiles on disk not listed: ${unlisted.length}; rows with no file: ${listedMissingOnDisk.length}\n`;
writeFileSync(`${CAPDIR}/index.md`, idx);
console.log(`index.md: ${rows.length} rows, ${missing.length} no-file rows, unlisted ${unlisted.length}, missing-on-disk ${listedMissingOnDisk.length}`);

// ---------- tables ----------
const find = [];
const normDetail = (d) => String(d).replace(/\.(?:svelte-[a-z0-9]+|s-[A-Za-z0-9]+)/g, '');
const add = (gate, r, setting, detail) => find.push({ gate, surface: r.surface, role: r.role, engine: eng(r), width: r.width, setting, detail: normDetail(detail) });
for (const r of recs) {
	if (r.status !== 200 || r.suspect) add('page status', r, '-', `HTTP ${r.status}${r.suspect ? `; text begins: ${r.suspect.replace(/\s+/g, ' ').slice(0, 120)}` : ''}`);
	for (const [sid, st] of Object.entries(r.settings)) {
		const g = st.gates ?? {};
		if (st.error) add('capture or gate error', r, sid, st.error);
		if (st.lastAtBottom === false) add('capture: last part not at page bottom', r, sid, `bottom ${st.lastScrollBottom} of ${st.lastScrollHeight}`);
		if (st.lastDiffersFromFirst === false) add('capture: last part equals the first', r, sid, 'identical pixels');
		if (g.overflow?.offenders) for (const s of g.overflow.sample) add('overflow', r, sid, s);
		if (g.overflow?.offenders > 12) add('overflow (count)', r, sid, `${g.overflow.offenders} offenders in total`);
		if (g.targets?.under?.length) for (const u of g.targets.under) add('target under 44px', r, sid, u);
		if (g.notGrown?.groups?.length) for (const u of g.notGrown.groups) add('text that did not grow', r, sid, u);
		if (g.axe) for (const v of g.axe.violations) for (const t of v.targets) add(`axe ${v.id} (${v.impact})`, r, sid, `${t.replace(/\[href[^\]]*\]/g, '')}${v.count > v.targets.length ? ` (+${v.count - v.targets.length} more nodes of this rule)` : ''}`);
		if (g.contrast?.offenders) for (const s of g.contrast.sample) add('text contrast below WCAG AA (own computation)', r, sid, /"Previous"|"Next"/.test(s) ? `${s} [the element is span.secondary.off with aria-disabled="true", an inactive pager item: src/routes/analytics/photos/+page.svelte lines 294 and 296]` : s);
		if (g.contrast?.offenders > 12) add('contrast (count)', r, sid, `${g.contrast.offenders} offenders in total`);
	}
	const k = r.gates.keyboard; const ka = r.gates.keyboardAltTab; const kf = r.gates.keyboardForced;
	for (const [name, w] of [['keyboard default', k], ['keyboard Alt+Tab (WebKit, all links)', ka], ['keyboard forced-colors (outline only)', kf]]) {
		if (!w) continue;
		for (const s of w.noRing) add(`${name}: stop with no visible ring`, r, name.includes('forced') ? 'forced-colors' : 'default', s);
		if (w.capped) add(`${name}: capped`, r, 'default', `stopped at ${w.stops}`);
		for (const s of w.offscreen) add(`${name}: focused element outside the viewport`, r, 'default', s);
	}
	if (r.blockedNonGet.length) add('non-GET request (aborted before sending)', r, '-', [...new Set(r.blockedNonGet.map((x) => x.replace(/\/[0-9a-f]{12}\/[^ ]*/, '/...')))].join(' ; '));
	if (r.blockedHost.length) add('request to another ninochavez.co host (aborted)', r, '-', r.blockedHost.join(' ; '));
	for (const c of r.console) add(/cdn-cgi/.test(c) ? 'console error caused by an aborted request' : 'console error or warning', r, '-', c.slice(0, 200));
	for (const c of r.consoleFromAbortedRequests ?? []) add('console error caused by an aborted request', r, '-', c.slice(0, 160));
	for (const c of r.pageErrors) add('uncaught page error', r, '-', c);
	for (const c of r.failed) add('failed request', r, '-', c);
	for (const c of r.badStatus) add('HTTP 400 or higher', r, '-', c);
	if (r.images.broken || r.images.incomplete) add('images', r, '-', `${r.images.broken} broken, ${r.images.incomplete} incomplete of ${r.images.total}`);
}
// Merge identical findings across role and engine.
const key = (f) => `${f.gate}||${f.surface}||${f.width}||${f.detail}`;
const merged = new Map();
for (const f of find) { const e = merged.get(key(f)) ?? { ...f, seen: new Set(), settings: new Set() }; e.seen.add(`${f.role}/${f.engine}`); e.settings.add(f.setting); merged.set(key(f), e); }
const out = [...merged.values()].sort((a, b) => a.gate.localeCompare(b.gate) || ORDER.indexOf(a.surface) - ORDER.indexOf(b.surface) || a.width.localeCompare(b.width));
let md = `## Per-load summary\n\n| surface | role | engine | width | captured (UTC) | Chicago date | HTTP | final URL path | title | images (broken/incomplete/total) | requests | non-GET aborted | console | page errors | failed | >=400 |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
for (const r of recs) md += `| ${r.surface} | ${r.role} | ${eng(r)} | ${r.width} | ${(r.capturedAt ?? '').replace('T', ' ').slice(0, 19)} | ${r.chicagoDate ?? ''} | ${r.status} | ${new URL(r.finalUrl).pathname}${new URL(r.finalUrl).search} | ${(r.title || '').slice(0, 50)} | ${r.images.broken}/${r.images.incomplete}/${r.images.total} | ${r.requests.total} | ${r.blockedNonGet.length} | ${r.console.length + (r.consoleFromAbortedRequests?.length ?? 0)} | ${r.pageErrors.length} | ${r.failed.length} | ${r.badStatus.length} |\n`;
md += `\n## Gate results per load\n\nOverflow offenders at each setting (0 = none), targets measured and under 44px, keyboard stops and stops with no ring, axe violation count (default), own contrast offenders (default, contrast-more, forced-colors).\n\n| surface | role | engine | width | overflow default / contrast-more / forced / text-200 / text-312 | targets measured / under 44 | keyboard stops / no ring | Alt+Tab stops / no ring (WebKit) | forced-colors keyboard stops / no outline | axe violations (default) | contrast offenders default / more / forced |\n| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;
for (const r of recs) {
	const o = (s) => r.settings[s]?.gates?.overflow ? r.settings[s].gates.overflow.offenders : '-';
	const d = r.settings.default?.gates ?? {};
	const c = (s) => r.settings[s]?.gates?.contrast ? r.settings[s].gates.contrast.offenders : '-';
	const k = r.gates.keyboard; const ka = r.gates.keyboardAltTab; const kf = r.gates.keyboardForced;
	md += `| ${r.surface} | ${r.role} | ${eng(r)} | ${r.width} | ${o('default')} / ${o('contrast-more')} / ${o('forced-colors')} / ${o('text-200')} / ${o('text-312')} | ${d.targets?.measured ?? '-'} / ${d.targets?.under?.length ?? '-'} | ${k?.stops ?? '-'} / ${k?.noRing?.length ?? '-'} | ${ka ? `${ka.stops} / ${ka.noRing.length}` : '-'} | ${kf ? `${kf.stops} / ${kf.noRing.length}` : '-'} | ${d.axe?.violations?.length ?? '-'} | ${c('default')} / ${c('contrast-more')} / ${c('forced-colors')} |\n`;
}
md += `\n## Findings (merged across role and engine)\n\nEach row is one finding. "seen in" lists every role/engine combination that produced it.\n\n| gate | surface | width | settings | detail | seen in |\n| --- | --- | --- | --- | --- | --- |\n`;
for (const f of out) md += `| ${f.gate} | ${f.surface} | ${f.width} | ${[...f.settings].sort((a, b) => SETORDER.indexOf(a) - SETORDER.indexOf(b)).join(', ')} | ${String(f.detail).replace(/\|/g, '/').replace(/\n/g, ' ')} | ${[...f.seen].sort().join(', ')} |\n`;
md += `\nFinding rows: ${out.length} (from ${find.length} raw observations).\n`;
writeFileSync(TABLES, md);
console.log(`tables: ${out.length} merged findings from ${find.length} raw`);
const counts = {}; for (const f of out) counts[f.gate] = (counts[f.gate] ?? 0) + 1;
console.log(JSON.stringify(counts, null, 1));
