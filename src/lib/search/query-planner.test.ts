import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validatePlan } from './query-planner';

test('keeps a jersey color only alongside a jersey number, normalized like stored sightings', () => {
	const plan = validatePlan({ jersey_number: '12', team_color: 'Light Blue.', semantic_text: '' });
	assert.equal(plan.jersey_number, '12');
	assert.equal(plan.team_color, 'light blue');
	assert.equal(plan.hasStructure, true);
});

test('drops a color with no jersey number: a color alone is a visual description', () => {
	const plan = validatePlan({ jersey_number: null, team_color: 'blue', semantic_text: 'players in blue' });
	assert.equal(plan.team_color, null);
	assert.equal(plan.semantic_text, 'players in blue');
});

test('folds grey to gray, matching normColor and the SQL norm_color', () => {
	assert.equal(validatePlan({ jersey_number: '7', team_color: 'GREY' }).team_color, 'gray');
});

test('rejects a malformed jersey number, and its color with it', () => {
	const plan = validatePlan({ jersey_number: 'twelve', team_color: 'blue' });
	assert.equal(plan.jersey_number, null);
	assert.equal(plan.team_color, null);
});
