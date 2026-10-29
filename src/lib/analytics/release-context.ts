/** Bounded deployment context is assigned by the server, never accepted from event JSON. */
export function analyticsReleaseContext(values: Record<string, string | undefined>, localDevelopment: boolean): string {
	if (localDevelopment) return 'local_development';
	const commit = values.CF_PAGES_COMMIT_SHA ?? values.GITHUB_SHA;
	if (commit && /^[a-f0-9]{7,40}$/i.test(commit)) return `commit_${commit.slice(0, 12).toLowerCase()}`;
	return 'deployment_unversioned';
}
