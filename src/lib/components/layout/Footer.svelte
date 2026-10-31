<script lang="ts">
	import { base } from '$app/paths';
</script>

<footer>
	<div class="main-footer">
		<p>Photographs by Nino Chavez</p>
		<nav aria-label="More">
			<a href={`${base}/work`}>Selected Works</a><a href="https://ninochavez.co/photography/coverage" target="_blank" rel="noopener"
				>Request coverage ↗</a
			><a href="https://ninochavez.co" target="_blank" rel="noopener" aria-label="Nino Chavez profile">Profile ↗</a><a
				href="https://ninochavez.co/blog"
				target="_blank"
				rel="noopener">Writing ↗</a
			>
		</nav>
	</div>
	<nav class="utility" aria-label="Site preferences">
		<a href={`${base}/collections`}>Collections</a><a href="https://ninochavez.co/privacy" target="_blank" rel="noopener">Privacy</a><a
			href={`${base}/analytics-preferences`}>Analytics preferences</a
		>
	</nav>
</footer>

<style>
	footer {
		padding: 32px 48px 24px;
		border-top: 1px solid #484844;
		color: #b9b9b3;
		font:
			13px/1.5 Arial,
			Helvetica,
			sans-serif;
	}
	.main-footer {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 24px;
		max-width: 1504px;
		margin: auto;
	}
	p {
		margin: 0;
	}
	nav {
		display: flex;
		flex-wrap: wrap;
		gap: 12px 28px;
	}
	a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
		color: inherit;
		text-decoration: none;
	}
	a:hover {
		text-decoration: underline;
		text-underline-offset: 5px;
	}
	a:focus-visible {
		outline: 2px solid #fff;
		outline-offset: 4px;
	}
	.utility {
		justify-content: flex-end;
		font-size: 12px;
		max-width: 1504px;
		margin: 12px auto 0;
		gap: 20px;
	}
	@media (max-width: 700px) {
		footer {
			padding: 28px 20px;
		}
		.main-footer {
			display: block;
		}
		.main-footer nav {
			margin-top: 12px;
			gap: 6px 24px;
		}
		.utility {
			justify-content: flex-start;
			gap: 8px 20px;
		}
	}
</style>
