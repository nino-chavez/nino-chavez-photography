import assert from 'node:assert/strict';
import test from 'node:test';
import { ANALYTICS_EXCLUSION_COOKIE, hasAnalyticsBrowserExclusion, issueAnalyticsIdentityBinding, verifiedAnalyticsIdentityBinding } from './preferences-contract';
import { analyticsReleaseContext } from './release-context';

test('self-exclusion works without an authenticated user', () => {
	assert.equal(hasAnalyticsBrowserExclusion({ get: (key: string) => key === ANALYTICS_EXCLUSION_COOKIE ? '1' : undefined }), true);
	assert.equal(hasAnalyticsBrowserExclusion({ get: () => undefined }), false);
});

test('only a server-issued binding can identify a browser for revocation', () => {
	const id = '123e4567-e89b-42d3-a456-426614174000';
	const binding = issueAnalyticsIdentityBinding(id, 'test-secret');
	assert.equal(verifiedAnalyticsIdentityBinding(binding ?? undefined, 'test-secret'), id);
	assert.equal(verifiedAnalyticsIdentityBinding(`${id}.forged`, 'test-secret'), null);
	assert.equal(verifiedAnalyticsIdentityBinding(binding ?? undefined, 'other-secret'), null);
});

test('accepted events receive bounded server release context', () => {
	assert.equal(analyticsReleaseContext({ CF_PAGES_COMMIT_SHA: 'A1B2C3D4E5F678901234' }, false), 'commit_a1b2c3d4e5f6');
	assert.equal(analyticsReleaseContext({ CF_PAGES_COMMIT_SHA: 'not a revision' }, false), 'deployment_unversioned');
	assert.equal(analyticsReleaseContext({}, true), 'local_development');
});
