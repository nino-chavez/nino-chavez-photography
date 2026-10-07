<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import { onMount, tick } from 'svelte';
	import { albumIndexPath, photosPath, settingsPath } from '$lib/analytics/report-paths';
	import { changeLabel, countLabel, csvRowCount, measureLabel, periodFor, PHOTO_RANK_LABELS, filterParams, photoParams } from '$lib/analytics/photo-view';
	import { describeSavedView, SAVED_VIEW_NAME_MAX, savedViewParams } from '$lib/analytics/saved-views';
	import { PHOTO_RANKS, type PhotoRank } from '$lib/analytics/report-contract';
	import ReportHeader from '$lib/components/analytics/ReportHeader.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	type Photo = PageData['view']['report']['photos'][number];
	const SHORTLIST_KEY = 'analytics:photo-shortlist';
	const VIEW_KEY = 'analytics:photo-view';

	const view = $derived(data.view);
	const report = $derived(view.report);
	const query = $derived(report.query);
	const rank = $derived<PhotoRank>(view.rank);
	const pageIndex = $derived(report.photoPagination?.page ?? 0);
	const pageCount = $derived(Math.max(1, report.photoPagination?.pageCount ?? 0));
	const total = $derived(report.photoPagination?.total ?? report.photos.length);
	const hostname = $derived(page.url.hostname);
	const names = $derived(new Map(view.albums.map((album) => [album.albumKey, album.name])));
	const albumName = (key: string) => names.get(key) ?? 'Album';
	const measure = $derived(measureLabel(query.measure));
	const newAlbums = $derived(new Set(report.newAlbumKeys));
	const rowsLabel = $derived(csvRowCount(query.measure, report.albumCount, total, report.albumOnlyActions.length).toLocaleString('en-US'));

	let hydrated = $state(false);
	let selectedAlbums = $state<string[]>([]);
	let albumSearch = $state('');
	let period = $state<'7' | '30' | '90' | 'custom'>('30');
	let compareMode = $state<'previous' | 'custom' | 'publication_age' | 'none'>('previous');
	let shortlist = $state<string[]>([]);
	let layout = $state<'images' | 'table'>('images');
	let columns = $state({ album: true, current: true, previous: true, change: true, latest: true, identity: true });
	// With no comparison selected, "before" and "change" would say "unavailable" on every row, so they are not offered.
	const comparable = $derived(query.compare !== 'none');
	let selected = $state<Photo | null>(null);
	let failedPreviews = $state(new Set<string>());
	let dialog = $state<HTMLDialogElement>();
	let opener: HTMLElement | null = null;

	// The form starts from what the address says, and again whenever the address changes.
	$effect(() => {
		selectedAlbums = query.scope === 'all' ? [] : [...query.albumKeys];
		period = periodFor(query.start, query.end);
		compareMode = query.compare;
		selected = null;
	});
	onMount(() => {
		hydrated = true;
		try {
			layout = sessionStorage.getItem(VIEW_KEY) === 'table' ? 'table' : 'images';
			const stored = JSON.parse(sessionStorage.getItem(SHORTLIST_KEY) ?? '[]');
			shortlist = Array.isArray(stored) ? stored.filter((value): value is string => typeof value === 'string').slice(0, 500) : [];
		} catch { shortlist = []; }
	});

	const albumChoices = $derived(view.albums.filter((album) => !albumSearch.trim() || album.name.toLowerCase().includes(albumSearch.trim().toLowerCase())).slice(0, 80));
	const albumSummary = $derived(selectedAlbums.length === 0 ? 'All albums' : selectedAlbums.length === 1 ? albumName(selectedAlbums[0]) : `${selectedAlbums.length} albums`);
	const activeFilters = $derived([query.sport && `Sport: ${query.sport}`, query.category && `Category: ${query.category}`, query.source && `Source: ${query.source}`, query.eventDate && `Event date: ${query.eventDate}`, query.season && `Season: ${query.season}`, query.traffic === 'inclusive' && 'All traffic'].filter(Boolean) as string[]);
	const filterCount = $derived(activeFilters.length);

	const params = $derived(photoParams(query, rank, pageIndex));
	const hrefFor = (next: { rank?: PhotoRank; page?: number }) => photosPath(hostname, `?${photoParams(query, next.rank ?? rank, next.page ?? pageIndex)}`);
	const csvBase = $derived(photosPath(hostname, `/export.csv?${filterParams(query)}`));
	const shortlistCsv = $derived(`${csvBase}&shortlist=${encodeURIComponent(shortlist.join(','))}`);
	const changeContext = $derived({ compare: query.compare, basis: report.rising.basis, currentDays: report.rising.currentDays, previousDays: report.rising.previousDays });
	const change = (photo: Photo) => changeLabel({ count: photo.count, previousCount: photo.previousCount, difference: photo.difference, newAlbum: newAlbums.has(photo.albumKey) }, changeContext);

	// Photos from an album published after the comparison period began have nothing earlier to compare with. Said once, not on every card.
	const showsNewAlbum = $derived(query.compare !== 'none' && rank !== 'recent' && report.photos.some((photo) => newAlbums.has(photo.albumKey)));

	// Rising leaves out photos from albums published after the comparison period began: say which, and where to see them.
	const leftOut = $derived(rank === 'rising' ? report.activeAlbums.filter((album) => newAlbums.has(album.albumKey)).map((album) => album.albumKey) : []);
	const leftOutHref = $derived(leftOut.length ? photosPath(hostname, `?${photoParams({ ...query, scope: leftOut.length === 1 ? 'album' : 'selected', albumKeys: leftOut }, 'popular', 0)}`) : '');
	const leftOutNames = $derived(new Intl.ListFormat('en', { type: 'conjunction' }).format(leftOut.map(albumName)));

	const when = (value: string | null | undefined) => (value ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value)) : 'Unavailable');
	const day = (value: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T12:00:00Z`));
	const updated = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' }).format(new Date(value));
	const viewHref = (stored: unknown) => {
		const filters = savedViewParams(stored);
		return filters ? photosPath(hostname, `?${filters}`) : null;
	};

	/** What a card says under the album name: when it last had activity, or how it changed. Nothing for a photo with no earlier period to compare with. */
	const cardNote = (photo: Photo) => (rank === 'recent' ? when(photo.lastActivity) : newAlbums.has(photo.albumKey) ? '' : `${change(photo)} · before ${photo.previousCount ?? 'unavailable'}`);

	function toggleAlbum(key: string) {
		selectedAlbums = selectedAlbums.includes(key) ? selectedAlbums.filter((value) => value !== key) : [...selectedAlbums, key].slice(0, 25);
	}
	function chooseLayout(next: 'images' | 'table') {
		layout = next;
		try { sessionStorage.setItem(VIEW_KEY, next); } catch { /* the choice then lasts for this page only */ }
	}
	function toggleShortlist(photoId: string) {
		shortlist = shortlist.includes(photoId) ? shortlist.filter((id) => id !== photoId) : [...shortlist, photoId];
		try { sessionStorage.setItem(SHORTLIST_KEY, JSON.stringify(shortlist)); } catch { /* the shortlist then lasts for this page only */ }
	}
	function previewFailed(url: string) {
		failedPreviews = new Set([...failedPreviews, url]);
	}
	async function open(photo: Photo, trigger: HTMLElement) {
		opener = trigger;
		selected = photo;
		await tick();
		dialog?.showModal();
		dialog?.querySelector<HTMLButtonElement>('.close')?.focus();
	}
	async function close() {
		dialog?.close();
		selected = null;
		await tick();
		opener?.focus();
	}
</script>

<svelte:head>
	<title>Photos · Photography reports</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>

<div class="photos">
	<ReportHeader current="photos" />

	<div class="body">
		<section class="intro" aria-labelledby="photos-title">
			<p class="eyebrow">Photo explorer</p>
			<h1 id="photos-title">Photos across the gallery</h1>
			<p class="lead">Which photos people opened, asked to download, favorited or shared in the dates you choose, for every album or the ones you pick. Counts are browser actions, not people. A photo's rank is how people responded to it, not a rating of the photograph. For one album's launch, open it from <a href={albumIndexPath(hostname)}>the album index</a>.</p>
		</section>

		<form id="filters" class="panel filters" method="GET" action={photosPath(hostname)} aria-label="Photo filters">
			<input type="hidden" name="photo_rank" value={rank} />
			<input type="hidden" name="photo_page" value="0" />
			{#if query.albumEventType}<input type="hidden" name="event_type" value={query.albumEventType} />{/if}
			<input type="hidden" name="albums" value={selectedAlbums.join(',')} />
			<input type="hidden" name="scope" value={selectedAlbums.length > 1 ? 'selected' : selectedAlbums.length === 1 ? 'album' : 'all'} />
			<div class="row">
				<div class="slot wide">
					<span class="field-label" id="albums-label">Albums</span>
					<details class="picker">
						<summary aria-labelledby="albums-label albums-summary"><span id="albums-summary">{albumSummary}</span><span class="hint">Choose</span></summary>
						<div class="menu">
							{#if !view.albumsAvailable}<p class="note">The album list could not be read just now. An address with album keys in it still works.</p>{/if}
							<label class="entry"><span class="field-label">Search album names</span><input type="search" bind:value={albumSearch} disabled={!hydrated} autocomplete="off" /></label>
							<button type="button" class="choice" disabled={!hydrated} onclick={() => (selectedAlbums = [])}><span>All albums</span>{#if selectedAlbums.length === 0}<span class="hint">Selected</span>{/if}</button>
							<ul class="choices">
								{#each albumChoices as album (album.albumKey)}
									<li><label class="choice"><input type="checkbox" checked={selectedAlbums.includes(album.albumKey)} disabled={!hydrated} onchange={() => toggleAlbum(album.albumKey)} /><span class="choice-text"><span class="choice-name">{album.name}</span><span class="hint">{album.photoCount.toLocaleString('en-US')} photos</span></span></label></li>
								{/each}
							</ul>
						</div>
					</details>
				</div>
				<label class="slot"><span class="field-label">Dates</span>
					<select name="period" bind:value={period}>
						<option value="7">Last 7 complete days</option><option value="30">Last 30 complete days</option><option value="90">Last 90 complete days</option><option value="custom">Custom dates</option>
					</select>
				</label>
				<label class="slot"><span class="field-label">Count</span>
					<select name="measure" value={query.measure}>
						<option value="photo_opens">Photo opens</option><option value="album_opens">Album opens</option><option value="downloads">Download requests</option><option value="favorites">Favorites</option><option value="shares">Shares</option>
					</select>
				</label>
				<button type="submit" class="primary apply">Apply</button>
			</div>
			{#if period === 'custom'}
				<div class="row">
					<label class="slot"><span class="field-label">First day</span><input type="date" name="start" value={query.start} /></label>
					<label class="slot"><span class="field-label">Last day</span><input type="date" name="end" value={query.end} /></label>
				</div>
			{/if}
			<details class="more">
				<summary>More filters{filterCount ? ` · ${filterCount} active` : ''}</summary>
				<div class="row">
					<label class="slot"><span class="field-label">Traffic</span>
						<select name="traffic" value={query.traffic}><option value="conservative">Audience and unclassified</option><option value="inclusive">Include controlled and automated</option></select>
					</label>
					<label class="slot"><span class="field-label">Sport</span>
						<select name="sport"><option value="">Any sport</option>{#each view.facets.sports as sport (sport)}<option value={sport} selected={query.sport === sport}>{sport}</option>{/each}</select>
					</label>
					<label class="slot"><span class="field-label">Photo category</span>
						<select name="category"><option value="">Any category</option>{#each view.facets.categories as category (category)}<option value={category} selected={query.category === category}>{category}</option>{/each}</select>
					</label>
					<label class="slot"><span class="field-label">Arrival or open source</span>
						<select name="source"><option value="">Any source</option><option value="direct" selected={query.source === 'direct'}>Unknown / no tag</option>{#each report.sourceOptions as source (source)}<option value={source} selected={query.source === source}>{source}</option>{/each}</select>
					</label>
					<label class="slot"><span class="field-label">Album event date</span><input type="date" name="event_date" value={query.eventDate ?? ''} /></label>
					<label class="slot"><span class="field-label">Season</span>
						<select name="season"><option value="">Any season</option>{#each view.facets.seasons as season (season)}<option value={season} selected={query.season === season}>{season}</option>{/each}</select>
					</label>
					<label class="slot"><span class="field-label">Compare with</span>
						<select name="compare" bind:value={compareMode}><option value="previous">The period before</option><option value="custom">Dates I choose</option><option value="none">Nothing</option></select>
					</label>
					{#if compareMode === 'custom'}
						<label class="slot"><span class="field-label">Comparison first day</span><input type="date" name="compare_start" value={query.compareStart ?? report.previous.start} /></label>
						<label class="slot"><span class="field-label">Comparison last day</span><input type="date" name="compare_end" value={query.compareEnd ?? report.previous.end} /></label>
					{/if}
				</div>
			</details>
			<p class="note">Days are counted in Chicago time. <a href={photosPath(hostname)}>Reset all filters</a></p>
		</form>

		{#if !report.available}
			<section class="panel alert-panel" aria-labelledby="unavailable-title" aria-live="polite">
				<h2 id="unavailable-title">The photo report is unavailable</h2>
				<p>{report.error}</p>
				<p class="note">No total, ranking or export is shown as zero in its place.</p>
			</section>
		{:else}
			<section class="panel" aria-labelledby="results-title">
				<div class="head">
					<div>
						<h2 id="results-title">{PHOTO_RANK_LABELS[rank]} photos</h2>
						<p class="note">{measure} from {day(query.start)} to {day(query.end)}{query.scope === 'all' ? ', all albums' : query.albumKeys.length === 1 ? `, ${albumName(query.albumKeys[0])}` : `, ${query.albumKeys.length} albums`}. {total.toLocaleString('en-US')} {total === 1 ? 'photo' : 'photos'}{report.coverage === 'complete' ? '' : '; some days are missing, so counts are what was recorded'}.{#if activeFilters.length} {activeFilters.join(' · ')}.{/if}</p>
					</div>
					<div class="toggle" role="group" aria-label="How to show the photos">
						<button type="button" class="secondary" aria-pressed={layout === 'images'} disabled={!hydrated} onclick={() => chooseLayout('images')}>Images</button>
						<button type="button" class="secondary" aria-pressed={layout === 'table'} disabled={!hydrated} onclick={() => chooseLayout('table')}>Table</button>
					</div>
				</div>

				<nav class="ranks" aria-label="Photo ranking">
					{#each PHOTO_RANKS as option (option)}
						{#if option === 'rising' && !report.rising.available}
							<span class="rank off" aria-disabled="true">{PHOTO_RANK_LABELS[option]}</span>
						{:else}
							<a class="rank" href={hrefFor({ rank: option, page: 0 })} aria-current={rank === option ? 'page' : undefined}>{PHOTO_RANK_LABELS[option]}</a>
						{/if}
					{/each}
				</nav>
				{#if !report.rising.available || report.rising.basis === 'daily_rate'}<p class="callout">{report.rising.label}</p>{/if}
				{#if showsNewAlbum}<p class="callout">Some of these photos are from albums published after the comparison period began. There is nothing earlier to compare them with, so they show their count and no change.</p>{/if}
				{#if leftOut.length}<p class="callout">Rising leaves out photos from {leftOutNames}. {leftOut.length === 1 ? 'That album was' : 'Those albums were'} published after the comparison period, so there is nothing to compare {leftOut.length === 1 ? 'its' : 'their'} photos with. <a href={leftOutHref}>See {leftOut.length === 1 ? 'its' : 'their'} photos under Popular</a>.</p>{/if}

				{#if report.photos.length === 0}
					<p class="note">No photo actions match these filters. Album-level actions are in the CSV.</p>
				{:else if layout === 'images'}
					<ul class="grid">
						{#each report.photos as photo (photo.photoId)}
							<li class="card" class:picked={shortlist.includes(photo.photoId)}>
								<button type="button" class="thumb" disabled={!hydrated} aria-label={`Inspect a photo from ${albumName(photo.albumKey)}: ${countLabel(photo.count, report.coverage)} ${measure.toLowerCase()}`} onclick={(event) => void open(photo, event.currentTarget)}>
									{#if photo.imageUrl && !failedPreviews.has(photo.imageUrl)}<img src={photo.imageUrl} alt="" loading="lazy" decoding="async" onerror={() => previewFailed(photo.imageUrl!)} />{:else}<span class="none">Preview unavailable</span>{/if}
									<span class="count">{countLabel(photo.count, report.coverage)}</span>
								</button>
								<div class="card-body">
									<p class="name">{albumName(photo.albumKey)}</p>
									{#if cardNote(photo)}<p class="meta">{cardNote(photo)}</p>{/if}
									<label class="check"><input type="checkbox" checked={shortlist.includes(photo.photoId)} disabled={!hydrated} onchange={() => toggleShortlist(photo.photoId)} /><span>Shortlist</span></label>
								</div>
							</li>
						{/each}
					</ul>
				{:else}
					<details class="columns">
						<summary>Choose table columns</summary>
						<div class="column-list">{#each Object.keys(columns).filter((key) => comparable || (key !== 'previous' && key !== 'change')) as key (key)}<label class="check"><input type="checkbox" checked={columns[key as keyof typeof columns]} disabled={!hydrated} onchange={() => (columns[key as keyof typeof columns] = !columns[key as keyof typeof columns])} /><span>{key}</span></label>{/each}</div>
					</details>
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -- a sideways-scrolling table must take keyboard focus so it can be scrolled without a mouse (WCAG 2.1.1) -->
					<div class="scroll" role="region" aria-label={`${PHOTO_RANK_LABELS[rank]} photos`} tabindex="0">
						<table>
							<caption class="sr-only">{PHOTO_RANK_LABELS[rank]} photos by {measure.toLowerCase()}</caption>
							<thead><tr><th scope="col">Photo</th>{#if columns.album}<th scope="col">Album</th>{/if}{#if columns.current}<th scope="col" class="num">This period</th>{/if}{#if columns.previous && comparable}<th scope="col" class="num">Before</th>{/if}{#if columns.change && comparable}<th scope="col" class="num">Change</th>{/if}{#if columns.latest}<th scope="col">Latest activity</th>{/if}</tr></thead>
							<tbody>
								{#each report.photos as photo (photo.photoId)}
									<tr class:picked={shortlist.includes(photo.photoId)}>
										<th scope="row">
											<button type="button" class="thumb small" disabled={!hydrated} aria-label={`Inspect photo ${photo.photoId}`} onclick={(event) => void open(photo, event.currentTarget)}>
												{#if photo.imageUrl && !failedPreviews.has(photo.imageUrl)}<img src={photo.imageUrl} alt="" loading="lazy" decoding="async" onerror={() => previewFailed(photo.imageUrl!)} />{:else}<span class="none">Inspect</span>{/if}
											</button>
											{#if columns.identity}<span class="ref">{photo.photoId}</span>{/if}
											<label class="check"><input type="checkbox" checked={shortlist.includes(photo.photoId)} disabled={!hydrated} onchange={() => toggleShortlist(photo.photoId)} /><span>Shortlist<span class="sr-only"> {photo.photoId}</span></span></label>
										</th>
										{#if columns.album}<td>{albumName(photo.albumKey)}</td>{/if}
										{#if columns.current}<td class="num">{countLabel(photo.count, report.coverage)}</td>{/if}
										{#if columns.previous && comparable}<td class="num">{newAlbums.has(photo.albumKey) ? 'Not published' : photo.previousCount ?? 'Unavailable'}</td>{/if}
										{#if columns.change && comparable}<td class="num">{change(photo)}</td>{/if}
										{#if columns.latest}<td>{when(photo.lastActivity)}</td>{/if}
									</tr>
								{/each}
							</tbody>
						</table>
					</div>
				{/if}

				<nav class="pager" aria-label="Photo pages">
					{#if pageIndex > 0}<a class="secondary" href={hrefFor({ page: pageIndex - 1 })}>Previous</a>{:else}<span class="secondary off" aria-disabled="true">Previous</span>{/if}
					<span class="count-line">Page {pageIndex + 1} of {pageCount}</span>
					{#if pageIndex + 1 < pageCount}<a class="secondary" href={hrefFor({ page: pageIndex + 1 })}>Next</a>{:else}<span class="secondary off" aria-disabled="true">Next</span>{/if}
				</nav>
				<div class="exports">
					<a class="primary" href={csvBase}>Export CSV · {rowsLabel} rows</a>
					{#if shortlist.length}<a class="secondary" href={shortlistCsv}>Shortlist CSV ({shortlist.length})</a>{/if}
				</div>
				<p class="note">The file holds every photo in these filters, not only this page, plus the album-level actions. The shortlist stays in this browser.{#if report.dataAsOf}{' '}Updated {when(report.dataAsOf)}.{/if}</p>
			</section>
		{/if}

		{#if data.owner}
			<section class="panel" aria-labelledby="views-title">
				<h2 id="views-title">Saved views</h2>
				<p class="note">A saved view keeps these filters, not their numbers. Rename or delete a view in <a href={settingsPath(hostname)}>Settings</a>.</p>
				{#if !data.savedViewsAvailable}
					<p class="alert" role="alert">Your saved views could not be read. They are not gone; reload in a few minutes.</p>
				{:else if data.savedViews.length}
					<ul class="views">
						{#each data.savedViews as saved (saved.id)}
							<li>
								<div>
									{#if viewHref(saved.query)}<a class="view-name" href={viewHref(saved.query)}>{saved.name}</a>{:else}<span class="view-name">{saved.name}</span>{/if}
									<p class="note">{describeSavedView(saved.query)} · updated {updated(saved.updated_at)}</p>
								</div>
								<form method="POST" action={`?/updateView&${params}`} use:enhance>
									<input type="hidden" name="id" value={saved.id} />
									<button type="submit" class="secondary">Update<span class="sr-only"> {saved.name} with the filters on this page</span></button>
								</form>
							</li>
						{/each}
					</ul>
					{#if form?.updated}<p class="ok" role="status">Updated. The view now holds the filters on this page.</p>{/if}
					{#if form?.updateError}<p class="alert" role="alert">{form.updateError}</p>{/if}
				{:else}
					<p class="note">You have no saved views yet.</p>
				{/if}
				<form class="save" method="POST" action={`?/saveView&${params}`} use:enhance>
					<label class="entry"><span class="field-label">Save the filters on this page as a new view</span><input name="name" maxlength={SAVED_VIEW_NAME_MAX} required placeholder="Name this view" /></label>
					<button type="submit" class="primary">Save view</button>
					{#if form?.saveError}<p class="alert" role="alert">{form.saveError}</p>{/if}
					{#if form?.saved}<p class="ok" role="status">Saved.</p>{/if}
				</form>
			</section>
		{/if}
	</div>

	{#if selected}
		<dialog bind:this={dialog} class="dialog" aria-labelledby="dialog-title" onclose={() => (selected = null)} oncancel={(event) => { event.preventDefault(); void close(); }}>
			<div class="dialog-bar"><button type="button" class="secondary close" onclick={() => void close()}>Close<span class="sr-only"> photo details</span></button></div>
			{#if selected.imageUrl && !failedPreviews.has(selected.imageUrl)}<img class="dialog-image" src={selected.imageUrl} alt={`Larger view from ${albumName(selected.albumKey)}`} onerror={() => selected?.imageUrl && previewFailed(selected.imageUrl)} />{:else}<p class="note">Preview unavailable.</p>{/if}
			<h2 id="dialog-title">{albumName(selected.albumKey)}</h2>
			<dl class="facts">
				<div><dt>{measure}, this period</dt><dd>{countLabel(selected.count, report.coverage)}</dd></div>
				{#if comparable}
					<div><dt>The period before</dt><dd>{selected.previousCount ?? 'Unavailable'}</dd></div>
					<div><dt>Change</dt><dd>{change(selected)}</dd></div>
				{/if}
				<div><dt>Latest activity</dt><dd>{when(selected.lastActivity)}</dd></div>
			</dl>
			<p class="note">Photo reference <span class="ref">{selected.photoId}</span></p>
			<div class="exports">
				{#if selected.photoSegment}<a class="primary" href={`https://ninochavez.co/photography/photo/${encodeURIComponent(selected.photoSegment)}`}>Open photo to share or download</a>{:else}<p class="note">A public photo address is unavailable.</p>{/if}
				<button type="button" class="secondary" onclick={() => toggleShortlist(selected!.photoId)}>{shortlist.includes(selected.photoId) ? 'Remove from shortlist' : 'Add to shortlist'}</button>
			</div>
		</dialog>
	{/if}
</div>


<style>
	.photos { --ink: #172033; --muted: #526176; --line: #d8e0ea; --blue: #1458c4; --blue-ink: #174ea6; --warn: #8f1d1d; background: #edf2f7; color: var(--ink); margin-inline: auto; max-width: 96rem; min-width: 0; overflow-x: clip; padding: .5rem 1rem 3rem; }
	@media (min-width: 640px) { .photos { padding: 1.25rem 1.5rem 3.5rem; } }
	@media (min-width: 1024px) { .photos { padding-inline: 2rem; } }
	a:focus-visible, button:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible, [tabindex]:focus-visible { outline: 3px solid var(--blue-ink); outline-offset: 2px; }

	.body { display: grid; gap: 1rem; min-width: 0; }
	.panel { background: #fff; border: 1px solid var(--line); border-radius: .9rem; min-width: 0; padding: 1rem; }
	.eyebrow { color: var(--blue-ink); font-size: .75rem; font-weight: 800; letter-spacing: .09em; margin: 0; text-transform: uppercase; }
	h1 { font-size: 1.55rem; font-weight: 750; letter-spacing: -.01em; line-height: 1.2; margin: .35rem 0 .4rem; }
	h2 { font-size: 1.05rem; font-weight: 700; margin: 0; }
	.lead, .note { color: var(--muted); font-size: .85rem; line-height: 1.5; margin: .35rem 0 0; max-width: 56rem; }
	.lead { font-size: .92rem; }
	.lead a, .note a, .callout a { color: var(--blue-ink); text-underline-offset: 3px; }
	.callout { background: #eef4fc; border-radius: .5rem; font-size: .85rem; line-height: 1.5; margin: .6rem 0 0; padding: .55rem .7rem; }
	.alert { background: #fdf0ef; border-radius: .5rem; color: var(--warn); font-size: .85rem; line-height: 1.45; margin: .6rem 0 0; padding: .55rem .7rem; }
	.ok { color: #195b33; font-size: .85rem; margin: .5rem 0 0; }
	.alert-panel { border-color: var(--warn); }

	.filters { display: grid; gap: .7rem; }
	.row { display: grid; gap: .6rem; grid-template-columns: repeat(auto-fit, minmax(min(100%, 10.5rem), 1fr)); align-items: end; }
	.slot, .entry { display: grid; gap: .25rem; min-width: 0; }
	.slot.wide { grid-column: 1 / -1; }
	@media (min-width: 900px) { .slot.wide { grid-column: auto; } .row:first-of-type { grid-template-columns: minmax(14rem, 1.6fr) repeat(2, minmax(10.5rem, 1fr)) auto; } }
	.field-label { color: var(--muted); font-size: .8rem; font-weight: 650; }
	input:not([type='hidden']):not([type='checkbox']), select { background: #fff; border: 1px solid #8fa1b8; border-radius: .45rem; color: var(--ink); font: inherit; font-size: .92rem; min-height: 2.75rem; min-width: 0; padding: 0 .6rem; width: 100%; }
	input[type='checkbox'] { block-size: 1.25rem; inline-size: 1.25rem; margin: 0; }
	.primary, .secondary { align-items: center; border: 1px solid var(--blue-ink); border-radius: .5rem; cursor: pointer; display: inline-flex; font: inherit; font-size: .88rem; font-weight: 650; justify-content: center; min-height: 2.75rem; padding: 0 .9rem; text-decoration: none; }
	.primary { background: var(--blue-ink); color: #fff; }
	.secondary { background: #fff; color: var(--blue-ink); }
	.secondary[aria-pressed='true'] { background: #dce9fa; }
	.secondary:disabled, .off { cursor: default; opacity: .6; }
	.apply { justify-self: start; }

	.picker { min-width: 0; }
	.picker summary, .more summary, .columns summary { align-items: center; color: var(--blue-ink); cursor: pointer; display: flex; font-weight: 650; gap: .5rem; justify-content: space-between; min-height: 2.75rem; }
	.picker summary { background: #fff; border: 1px solid #8fa1b8; border-radius: .45rem; color: var(--ink); padding: 0 .6rem; }
	.hint { color: var(--muted); font-size: .78rem; font-weight: 500; }
	.menu { border: 1px solid var(--line); border-radius: .5rem; display: grid; gap: .4rem; margin-top: .3rem; padding: .6rem; }
	.choices { display: grid; list-style: none; margin: 0; max-height: 16rem; overflow-y: auto; padding: 0; }
	.choice { align-items: center; background: none; border: 0; color: var(--ink); cursor: pointer; display: flex; font: inherit; gap: .6rem; justify-content: space-between; min-height: 2.75rem; padding: 0 .3rem; text-align: left; width: 100%; }
	.choice:hover { background: #eef4fc; }
	.choice-text { display: grid; min-width: 0; }
	.choice-name { overflow-wrap: anywhere; }
	.more { border-top: 1px solid var(--line); padding-top: .3rem; }

	.head { align-items: start; display: flex; flex-wrap: wrap; gap: .6rem 1rem; justify-content: space-between; }
	.toggle { display: flex; gap: .4rem; }
	.ranks { display: flex; flex-wrap: wrap; gap: .4rem; margin-top: .7rem; }
	.rank { align-items: center; border: 1px solid #8fa1b8; border-radius: .5rem; color: var(--blue-ink); display: inline-flex; font-size: .88rem; font-weight: 650; min-height: 2.75rem; padding: 0 .9rem; text-decoration: none; }
	.rank[aria-current='page'] { background: #dce9fa; border-color: var(--blue-ink); }
	.rank.off { color: var(--muted); }

	.grid { display: grid; gap: .8rem; grid-template-columns: repeat(2, minmax(0, 1fr)); list-style: none; margin: .8rem 0 0; padding: 0; }
	@media (min-width: 640px) { .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
	@media (min-width: 900px) { .grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
	@media (min-width: 1200px) { .grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
	.card { background: #fff; border: 1px solid var(--line); border-radius: .7rem; min-width: 0; overflow: hidden; }
	.card.picked, tr.picked { box-shadow: inset 0 0 0 2px var(--blue-ink); }
	.thumb { align-items: center; aspect-ratio: 3 / 2; background: #e8edf3; border: 0; color: var(--muted); cursor: pointer; display: grid; overflow: hidden; padding: 0; position: relative; width: 100%; }
	.thumb img { block-size: 100%; inline-size: 100%; inset: 0; object-fit: cover; position: absolute; }
	.thumb.small { aspect-ratio: auto; block-size: 2.75rem; inline-size: 4.5rem; }
	.thumb .none { font-size: .75rem; padding: .3rem; text-align: center; }
	.count { background: rgb(23 32 51 / .9); border-radius: .35rem; bottom: .4rem; color: #fff; font-size: .78rem; font-weight: 650; left: .4rem; padding: .1rem .45rem; position: absolute; }
	.card-body { padding: .5rem .6rem .6rem; }
	.name { font-size: .9rem; font-weight: 650; margin: 0; overflow-wrap: anywhere; }
	.meta { color: var(--muted); font-size: .78rem; line-height: 1.4; margin: .15rem 0 .3rem; }
	.check { align-items: center; cursor: pointer; display: inline-flex; font-size: .85rem; gap: .5rem; min-height: 2.75rem; }
	.columns { margin-top: .6rem; }
	.column-list { display: flex; flex-wrap: wrap; gap: .2rem 1rem; text-transform: capitalize; }

	.scroll { margin-top: .6rem; max-width: 100%; overflow-x: auto; position: relative; }
	table { border-collapse: collapse; font-size: .88rem; min-width: 40rem; width: 100%; }
	th, td { border-bottom: 1px solid #e6ecf3; padding: .45rem .6rem; text-align: left; vertical-align: middle; }
	th[scope='row'] { font-weight: 500; }
	td { white-space: nowrap; }
	.num { font-variant-numeric: tabular-nums; text-align: right; }
	.ref { color: var(--muted); display: block; font-family: ui-monospace, monospace; font-size: .75rem; overflow-wrap: anywhere; }

	.pager { align-items: center; display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .8rem; }
	.count-line { color: var(--muted); font-size: .85rem; }
	.exports { align-items: center; display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .6rem; }

	.views { display: grid; gap: .6rem; list-style: none; margin: .6rem 0 0; padding: 0; }
	.views li { align-items: start; border-top: 1px solid #e6ecf3; display: flex; flex-wrap: wrap; gap: .4rem 1rem; justify-content: space-between; padding-top: .6rem; }
	.views li:first-child { border-top: 0; padding-top: 0; }
	.view-name { align-items: center; color: var(--blue-ink); display: inline-flex; font-weight: 700; min-height: 2.75rem; overflow-wrap: anywhere; text-underline-offset: 3px; }
	.save { align-items: end; border-top: 1px solid #e6ecf3; display: flex; flex-wrap: wrap; gap: .6rem; margin-top: .8rem; padding-top: .8rem; }
	.save .entry { flex: 1 1 16rem; }

	.dialog { background: #fff; border: 0; border-radius: .9rem; box-shadow: 0 20px 60px rgb(23 32 51 / .35); color: var(--ink); max-height: min(92dvh, 46rem); max-width: min(94vw, 34rem); overflow: auto; padding: .75rem 1rem 1rem; width: 100%; }
	.dialog::backdrop { background: rgb(23 32 51 / .6); }
	.dialog-bar { display: flex; justify-content: flex-end; margin-bottom: .25rem; }
	.dialog-image { border-radius: .6rem; display: block; inline-size: 100%; max-block-size: 22rem; object-fit: contain; }
	.facts { display: grid; gap: .5rem; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: .6rem 0; }
	.facts div { background: #f4f7fb; border-radius: .5rem; padding: .5rem .6rem; }
	.facts dt { color: var(--muted); font-size: .74rem; }
	.facts dd { font-size: 1.1rem; font-variant-numeric: tabular-nums; font-weight: 750; margin: .1rem 0 0; overflow-wrap: anywhere; }
	.sr-only { clip: rect(0 0 0 0); height: 1px; overflow: hidden; position: absolute; white-space: nowrap; width: 1px; }
	@media (forced-colors: active) { .panel, .card, input, select, .primary, .secondary, .rank { border: 1px solid CanvasText; } }
	@media (prefers-contrast: more) { .photos { --muted: #36445a; --line: #5c6b80; } .note, .lead, .meta, .field-label, .hint, .count-line { color: #2b3748; } }
</style>
