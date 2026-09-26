/**
 * Builds the 20-photo spot-check sheet: a public CF Images URL + Claude's ground-truth label for
 * each, so Nino can eyeball-verify the labels this whole eval depends on. Picks a mix across
 * albums/categories/sighting-density so the sample isn't all one type.
 */
import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { cfImageUrl } from '../../src/lib/utils/cloudflare-images';

const photos = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/photos.json'), 'utf8'));
const labels: Record<string, any> = JSON.parse(readFileSync(resolve(process.cwd(), '.temp/eval/labels.json'), 'utf8'));

// Curated 20-photo mix: a few from each album, spanning categories and sighting density
// (zero-sighting false-positive traps, dense sighting frames, role-ambiguous bench/huddle cases).
const PICKS = [
	'fJKdsB-DSC08793', 'fJKdsB-DSC09159', 'fJKdsB-DSC08644', 'fJKdsB-DSC08931', 'fJKdsB-DSC08830',
	'1BlKk4-DSC06976', '1BlKk4-DSC07042', '1BlKk4-DSC06977',
	'DSC03453', 'DSC03909', 'DSC01905', 'DSC02160',
	'eqYF0h-DSC08553', 'eqYF0h-DSC08398',
	'DSC03712', 'DSC03694',
	'fJKdsB-DSC08629', 'fJKdsB-DSC09048',
	'1BlKk4-DSC07265', 'DSC02954',
	// D6M8cZ - added mid-eval per orchestrator request (bench/spectator FP check); labeled before scoring.
	'8TH7rtJ', 'sfBfp4x', 'sKJ9z9L',
];

function main() {
	const byId = new Map(photos.map((p: any) => [p.cf_image_id, p]));
	const rows = PICKS.map((id) => {
		const p: any = byId.get(id);
		const l = labels[id];
		return {
			cf_image_id: id,
			album: p?.album_name,
			image_url: cfImageUrl(id, 'large'),
			claude_labels: {
				category: l.category,
				play_type: l.play_type,
				on_court_players: l.on_court_players,
				non_player_numbers: l.non_player_numbers,
				notes: l.notes,
			},
		};
	});

	let md = '# Ground-truth spot-check sheet\n\n';
	md += 'Labeled by Claude (Sonnet 5) from CF Images, not by Nino. Please skim each image against the label; flag anything wrong.\n\n';
	for (const r of rows) {
		md += `## ${r.cf_image_id} (${r.album})\n\n`;
		md += `Image: ${r.image_url}\n\n`;
		md += `- category: \`${r.claude_labels.category}\`\n`;
		md += `- play_type: \`${r.claude_labels.play_type}\`\n`;
		md += `- on-court sightings: ${r.claude_labels.on_court_players.length ? r.claude_labels.on_court_players.map((p: any) => `#${p.jersey_number} (${p.team_color}, ${p.role}, ${p.legibility})`).join(', ') : 'none'}\n`;
		if (r.claude_labels.non_player_numbers?.length) md += `- non-player numbers (false-positive trap): ${r.claude_labels.non_player_numbers.map((n: any) => `"${n.text}" - ${n.context}`).join('; ')}\n`;
		md += `- notes: ${r.claude_labels.notes}\n\n`;
	}

	writeFileSync(resolve(process.cwd(), '.temp/eval/SPOTCHECK.md'), md);
	writeFileSync(resolve(process.cwd(), '.temp/eval/spotcheck.json'), JSON.stringify(rows, null, 2));
	console.log(`Wrote ${rows.length} rows to .temp/eval/SPOTCHECK.md`);
}
main();
