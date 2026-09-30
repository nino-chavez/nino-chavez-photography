<script lang="ts">
	import { base } from '$app/paths';
	import { goto } from '$app/navigation';
 import { page, navigating } from '$app/state';
 import { reportPath } from '$lib/analytics/report-paths';
	import { Download, Filter, Images, List, Save, Search, Share2, ShieldCheck, TrendingUp, X } from 'lucide-svelte';
	import { tick, untrack, onMount } from 'svelte';
	import AnalyticsTrend from '$lib/components/analytics/AnalyticsTrend.svelte';
	import AlbumComparisonTable, { type AlbumRow } from '$lib/components/analytics/AlbumComparisonTable.svelte';
	import AlbumInspector from '$lib/components/analytics/AlbumInspector.svelte';
	import AnalyticsPreferences from '$lib/components/analytics/AnalyticsPreferences.svelte';
	import type { PageData } from './$types';

	let { data, form }: { data: PageData; form: Record<string, unknown> | null } = $props();
	type PhotoResult = PageData['report']['photos'][number];
	type Correction = PageData['correctionLog'][number];
	type Section = 'overview' | 'albums' | 'photos' | 'sources' | 'measurement' | 'analytics-preferences';
	const sections: { id: Section; label: string }[] = [
		{ id: 'overview', label: 'Overview' }, { id: 'albums', label: 'Albums' },
		{ id: 'photos', label: 'Photos' }, { id: 'sources', label: 'Sources' },
		{ id: 'measurement', label: 'Measurement' }, { id: 'analytics-preferences', label: 'Preferences' }
	];
	let activeSection = $state<Section>(untrack(() => data.section));
	let mobileFiltersOpen = $state(false);
	function sectionFromHash(hash: string): Section {
		const requested = hash.slice(1);
		return sections.find((section) => section.id === requested)?.id ?? 'overview';
	}
	function sectionHref(section: Section) {
		return `${reportHref({ section })}#${section}`;
	}
	function openSection(section: Section) {
		void goto(sectionHref(section), { keepFocus: true, noScroll: false });
	}

	const report = $derived(data.report);
	const sourceJourney = $derived(data.journeys.find((journey) => journey.report === 'sources_return'));
	let hydrated = $state(false);
	const interactive = $derived(hydrated && !navigating.to);
	let selectedAlbumKey = $state<string | null>(null);
	onMount(()=>{
		hydrated=true;
		selectedAlbumKey = sessionStorage.getItem('analytics:selected-album');
		photoView = (sessionStorage.getItem('analytics:photo-view') as 'images' | 'table' | null) ?? 'images';
			try {
				const storedShortlist = JSON.parse(sessionStorage.getItem('analytics:photo-shortlist') ?? '[]');
				shortlist = Array.isArray(storedShortlist) ? storedShortlist.filter((value): value is string => typeof value === 'string').slice(0, 500) : [];
			} catch {
				shortlist = [];
			}
			const legacySection = sectionFromHash(location.hash);
			if (!page.url.searchParams.has('section') && legacySection !== 'overview') {
				void goto(sectionHref(legacySection), { replaceState: true, keepFocus: true, noScroll: true });
			} else if (data.section === 'photos' && page.url.searchParams.get('photo_page') !== String(data.report.photoPagination?.page ?? 0)) {
				void goto(`${reportHref({ section: 'photos', photo_page: String(data.report.photoPagination?.page ?? 0), photo_rank: data.report.photoPagination?.rank ?? 'popular' })}#photos`, { replaceState: true, keepFocus: true, noScroll: true });
			}
		});
	let shortlist = $state<string[]>([]);
	let photoPage = $state(untrack(() => data.report.photoPagination?.page ?? 0));
	let albumPage = $state(0);
	const albumPageSize = 12;
	let impactPage = $state(0);
	const impactPageSize = 12;
	let photoRank = $state<'popular' | 'rising' | 'recent'>(untrack(() => data.report.photoPagination?.rank ?? 'popular'));
	let photoView = $state<'images' | 'table'>('images');
	let selectedPhoto = $state<PhotoResult | null>(null);
	let photoTrigger: HTMLElement | null = null;
	let photoDialog = $state<HTMLDialogElement>();
	let selectedAlbums = $state<string[]>(untrack(()=>[...data.report.query.albumKeys]));
	let albumSearch = $state('');
	let albumTableSearch = $state('');
	let period = $state<'7' | '30' | '90' | 'custom'>(untrack(()=>initialPeriod(data.report.query.start, data.report.query.end)));
	let compareMode = $state(untrack(()=>data.report.query.compare));
	let columns = $state({ album: true, current: true, previous: true, change: true, latest: true, identity: true });

	$effect(()=>{
		const query=data.report.query;
		const requestedPage=Math.max(0,Number.parseInt(page.url.searchParams.get('photo_page')??'0',10)||0);
		const requestedRank=page.url.searchParams.get('photo_rank');
		selectedAlbums=query.scope==='all'?[]:[...query.albumKeys];period=initialPeriod(query.start,query.end);compareMode=query.compare;activeSection=data.section;
		photoPage=data.section==='photos' ? data.report.photoPagination?.page??0 : requestedPage;
		photoRank=data.section==='photos' ? data.report.photoPagination?.rank??'popular' : requestedRank==='rising'||requestedRank==='recent'?requestedRank:'popular';
		selectedPhoto=null;
	});
	const filteredAlbumChoices = $derived(data.albumCatalogue.filter((album) =>
		!albumSearch.trim() || (album.album_name ?? album.album_key).toLowerCase().includes(albumSearch.trim().toLowerCase())
	).slice(0, 80));
	const sourceOptions = $derived([...new Set([
		...report.sources.arrivals.map((row) => row.source),
		...report.sources.openLocations.map((row) => row.source)
	])].filter((value) => value !== 'Unknown / no tag').sort());
	const queryString = $derived(new URLSearchParams({
		period: 'custom', start: report.query.start, end: report.query.end, measure: report.query.measure,
		scope: report.query.scope, albums: report.query.albumKeys.join(','), traffic: report.query.traffic,
		...(report.query.sport ? { sport: report.query.sport } : {}),
		...(report.query.category ? { category: report.query.category } : {}),
		...(report.query.source ? { source: report.query.source } : {}),
		...(report.query.eventDate ? { event_date: report.query.eventDate } : {}),
		...(report.query.season ? { season: report.query.season } : {}),
		...(report.query.albumEventType ? { event_type: report.query.albumEventType } : {}),
		compare: report.query.compare,
		...(report.query.compareStart ? { compare_start: report.query.compareStart } : {}),
			...(report.query.compareEnd ? { compare_end: report.query.compareEnd } : {}),
			section: data.section,
			photo_page: String(data.section === 'photos' ? data.report.photoPagination?.page ?? 0 : Math.max(0, Number.parseInt(page.url.searchParams.get('photo_page') ?? '0', 10) || 0)),
			photo_rank: data.section === 'photos' ? data.report.photoPagination?.rank ?? 'popular' : page.url.searchParams.get('photo_rank') === 'rising' || page.url.searchParams.get('photo_rank') === 'recent' ? page.url.searchParams.get('photo_rank')! : 'popular'
		}).toString());
		const visiblePhotos = $derived(report.photos);
		const photoPageCount = $derived(Math.max(1, report.photoPagination?.pageCount ?? 0));
		const photoTotal = $derived(report.photoPagination?.total ?? report.photos.length);
 const albumRows = $derived(report.albums.map(current=>{
  const album=data.albumCatalogue.find(album=>album.album_key===current.albumKey);
  return {key:current.albumKey,name:album?.album_name ?? current.albumKey,photoCount:Number(album?.photo_count ?? 0),visibility:album?.visibility ?? 'unknown',publishedAt:album?.published_at ?? null,...current};
 }).filter(album=>!albumTableSearch.trim() || album.name.toLowerCase().includes(albumTableSearch.trim().toLowerCase())));
	const albumPageCount = $derived(Math.max(1, Math.ceil(albumRows.length / albumPageSize)));
	const visibleAlbumRows = $derived(albumRows.slice(albumPage * albumPageSize, (albumPage + 1) * albumPageSize));
	const impactPageCount = $derived(Math.max(1, Math.ceil(report.trafficImpact.length / impactPageSize)));
	const visibleImpactRows = $derived(report.trafficImpact.slice(impactPage * impactPageSize, (impactPage + 1) * impactPageSize));
	$effect(() => { albumTableSearch; albumPage = 0; });
	$effect(() => { report.query; impactPage = 0; });
 const selectedAlbumDetail = $derived(albumRows.find(album=>album.key===selectedAlbumKey) ?? null);
	const leadingAlbums = $derived([...albumRows].filter((album) => album.count !== null && album.count > 0).sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 5));
	const leadingPhotos = $derived([...report.photos].filter((photo) => photo.count !== null && photo.count > 0).sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 4));
	$effect(() => {
		if (albumRows.length && !albumRows.some((album) => album.key === selectedAlbumKey)) selectedAlbumKey = albumRows[0].key;
	});

	const activeFilterCount = $derived([
		report.query.scope !== 'all', !!report.query.sport, !!report.query.category, !!report.query.source,
		!!report.query.eventDate, !!report.query.season, !!report.query.albumEventType,
		report.query.traffic === 'inclusive'
	].filter(Boolean).length);

 const activeFilters=$derived([report.query.sport&&`Sport: ${report.query.sport}`,report.query.category&&`Category: ${report.query.category}`,report.query.source&&`Source: ${report.query.source}`,report.query.eventDate&&`Event date: ${report.query.eventDate}`,report.query.season&&`Season: ${report.query.season}`,report.query.albumEventType&&`Event type: ${report.query.albumEventType}`,report.query.traffic==='inclusive'&&'All traffic'].filter(Boolean).join(' · '));
	function toggleAlbum(albumKey: string) {
		selectedAlbums = selectedAlbums.includes(albumKey)
			? selectedAlbums.filter((key) => key !== albumKey)
			: [...selectedAlbums, albumKey].slice(0, 25);
	}
	function selectAlbum(row: AlbumRow) {
		selectedAlbumKey = row.key;
		if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('analytics:selected-album', row.key);
	}
	function changeAlbumPage(next: number) {
		albumPage = Math.max(0, Math.min(next, albumPageCount - 1));
		const first = albumRows[albumPage * albumPageSize];
		if (first) selectAlbum(first);
	}
	function setPhotoView(view: 'images' | 'table') {
		photoView = view;
		if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('analytics:photo-view', view);
	}
	function toggleShortlist(photoId: string) {
		shortlist = shortlist.includes(photoId) ? shortlist.filter((id) => id !== photoId) : [...shortlist, photoId];
		if (typeof sessionStorage !== 'undefined') sessionStorage.setItem('analytics:photo-shortlist', JSON.stringify(shortlist));
	}
	function shortlistExportUrl() {
		return `${reportPath(page.url.hostname, 'gallery', '/export.csv')}?${queryString}&shortlist=${encodeURIComponent(shortlist.join(','))}`;
	}
	function reportHref(overrides: Record<string, string>) {
		const params = new URLSearchParams(queryString);
		for (const [key, value] of Object.entries(overrides)) params.set(key, value);
		return `?${params.toString()}`;
	}
	function displayMeasure(value: string) {
		return value.replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());
	}
	function initialPeriod(start: string, end: string): '7' | '30' | '90' | 'custom' {
		const days = Math.round((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86_400_000) + 1;
		return days === 7 || days === 30 || days === 90 ? String(days) as '7' | '30' | '90' : 'custom';
	}
	function correctionContext(correction: Correction) {
		const event = correction.event;
		if (!event) return 'Retained event context unavailable';
		const album = data.albumCatalogue.find((item) => item.album_key === event.album_key);
		return `${album?.album_name ?? 'Gallery'} · ${event.event_type.replaceAll('_', ' ')} · ${formatTime(event.created_at)}`;
	}
	function savedHref(savedQuery: unknown) {
		if (!savedQuery || typeof savedQuery !== 'object' || Array.isArray(savedQuery)) return '#';
		const params = new URLSearchParams();
		for (const [key, value] of Object.entries(savedQuery)) {
			if (Array.isArray(value)) params.set(key, value.join(','));
			else if (typeof value === 'string') params.set(key, value);
		}
			params.set('section', 'sources');
			return `?${params.toString()}#sources`;
	}
	function formatDate(value: string | null | undefined) {
		if (!value) return 'No recorded activity';
		return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(value.length === 10 ? `${value}T12:00:00Z` : value));
	}
	async function openPhoto(photo: PhotoResult, trigger: HTMLElement) {
		photoTrigger = trigger;
		selectedPhoto = photo;
		await tick();
		photoDialog?.showModal();
		photoDialog?.querySelector<HTMLButtonElement>('.dialog-close')?.focus();
	}
	async function closePhoto() {
		photoDialog?.close();
		selectedPhoto = null;
		await tick();
		photoTrigger?.focus();
	}
	function countLabel(count:number|null) { return count===null ? 'Unavailable' : `${count.toLocaleString()}${report.coverage==='complete'?'':' recorded'}`; }
	function legacyMeasureTotal(measure: 'photo_opens' | 'album_opens' | 'downloads' | 'favorites' | 'shares'): number | null {
		const values = report.albums.map((album) => album.measures[measure]);
		return values.some((value) => value === null) ? null : values.reduce<number>((total, value) => total + (value ?? 0), 0);
	}
	function legacyEngagementTotal(): number | null {
		const values = ['downloads', 'favorites', 'shares'] as const;
		const totals = values.map(legacyMeasureTotal);
		return totals.some((value) => value === null) ? null : totals.reduce<number>((total, value) => total + (value ?? 0), 0);
	}
 function changeLabel(item:{count:number|null;previousCount:number|null;difference:number|null}) {
  if(report.query.compare==='none')return 'No comparison selected';
  if(report.rising.basis==='daily_rate' && item.count!==null && item.previousCount!==null) {
   const days=report.rising.currentDays;const previousDays=report.rising.previousDays;
   const rate=item.count/days-item.previousCount/previousDays;
   return `${rate>=0?'+':''}${rate.toLocaleString(undefined,{maximumFractionDigits:1})} actions/day`;
  }
  if(item.difference===null)return 'Comparison unavailable';
  if(item.previousCount===0 && (item.count??0)>0)return 'New activity';
  return item.difference===0?'No change':`${item.difference>0?'+':''}${item.difference.toLocaleString()}`;
 }
 function formatTime(value:string|null|undefined) {
  if(!value)return 'Unavailable';
  return new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(new Date(value));
 }
 function actionHref(action:string) { return `?/${action}&${queryString}#${action.toLowerCase().includes('classification') ? 'measurement' : 'sources'}`; }

</script>

<svelte:head>
	<title>Gallery analytics</title>
	<meta name="robots" content="noindex, nofollow, noarchive" />
</svelte:head>


{#if navigating.to}<p class="report-loading" role="status">Loading report…</p>{/if}
<div aria-busy={!!navigating.to} aria-label="Gallery analytics workspace" class="analytics-workspace mx-auto min-w-0 max-w-[96rem] overflow-x-clip px-4 py-2 sm:py-5 sm:px-6 lg:px-8">
	<div class="workspace-masthead">
		<div class="workspace-identity"><span class="workspace-mark" aria-hidden="true">NC</span><span>Nino Chavez <span class="workspace-divider">/</span> Photography reports</span></div>
		<div class="flex items-center gap-2"><a class="gallery-return" href={`${reportPath(page.url.hostname, 'sites')}`}>All sites</a><a class="gallery-return" href="https://ninochavez.co/photography/">View gallery <span aria-hidden="true">↗</span></a></div>
	</div>
	<header class="border-b border-charcoal-700 pb-2">
		<div class="flex flex-wrap items-start justify-between gap-3">
			<div>
				<p class="eyebrow">Photography reports</p>
				<h1 class="mt-1 font-display text-2xl text-charcoal-100 sm:text-3xl">Gallery analytics</h1>
				<p class="mt-1 hidden max-w-2xl text-sm text-charcoal-300 lg:block">Compare album activity and inspect the evidence.</p>
			</div>
			<div class="hidden items-center gap-2 text-xs text-charcoal-400 sm:flex"><ShieldCheck class="size-4 text-gold-400" /> {data.user ? 'Operator tools enabled' : 'Available by direct link'}</div>
		</div>
	</header>

		<nav class="analytics-nav sticky top-0 z-20 -mx-4 flex flex-wrap gap-1 border-b border-charcoal-800 bg-charcoal-950/95 px-4 py-1 backdrop-blur sm:mx-0 sm:px-0" aria-label="Analytics sections">
			{#each sections as section}
				<a class="section-link" class:section-active={activeSection === section.id} href={sectionHref(section.id)} aria-current={activeSection === section.id ? 'page' : undefined}>{section.label}</a>
			{/each}
		</nav>

	<div class="mobile-filter-bar"><span>{report.query.scope === 'all' ? 'All albums' : report.query.albumKeys.length === 1 ? 'One album' : `${report.query.albumKeys.length} albums`} · {displayMeasure(report.query.measure)}{activeFilterCount ? ` · ${activeFilterCount} active` : ''}</span><button type="button" aria-expanded={mobileFiltersOpen} aria-controls="report-filters" onclick={() => (mobileFiltersOpen = !mobileFiltersOpen)}>{mobileFiltersOpen ? 'Hide filters' : 'Filters'}</button></div>
		<form id="report-filters" method="GET" action={`#${activeSection}`} class="report-controls mt-2" class:mobile-open={mobileFiltersOpen} aria-label="Report filters">
			<input disabled={!interactive} type="hidden" name="section" value={activeSection} />
			<input disabled={!interactive} type="hidden" name="photo_page" value="0" />
			<input disabled={!interactive} type="hidden" name="photo_rank" value={photoRank} />
		<div class="grid min-w-0 grid-cols-2 gap-3 md:grid-cols-[minmax(14rem,1.4fr)_minmax(9rem,.7fr)_minmax(10rem,.8fr)_auto]">
			<div class="album-picker-wrap report-field col-span-2 min-w-0 md:col-span-1">
				<span class="filter-label">Albums</span>
			<details class="album-picker min-w-0">
				<summary class="control flex min-h-11 cursor-pointer items-center justify-between gap-2">
					<span class="truncate">{selectedAlbums.length === 0 ? 'All albums' : selectedAlbums.length === 1 ? data.albumCatalogue.find((album) => album.album_key === selectedAlbums[0])?.album_name ?? 'One album' : `${selectedAlbums.length} albums`}</span>
					<span class="text-xs text-charcoal-400">Choose</span>
				</summary>
				<div class="album-menu">
					<label class="relative block"><span class="sr-only">Search album names</span><Search class="absolute left-3 top-3 size-4 text-charcoal-500" /><input disabled={!interactive} class="control pl-9" bind:value={albumSearch} placeholder="Search album names" /></label>
					<button class="album-option mt-2" type="button" onclick={() => (selectedAlbums = [])}><span>All albums</span><span>{selectedAlbums.length === 0 ? 'Selected' : ''}</span></button>
					<div class="mt-1 max-h-64 overflow-y-auto">
						{#each filteredAlbumChoices as album}
							<label class="album-option"><input disabled={!interactive} type="checkbox" checked={selectedAlbums.includes(album.album_key)} onchange={() => toggleAlbum(album.album_key)} /><span class="min-w-0 flex-1"><span class="block truncate text-charcoal-100">{album.album_name}</span><span class="block text-xs text-charcoal-500">{Number(album.photo_count).toLocaleString()} photos{album.visibility === 'unlisted' ? ' · unlisted' : ''}</span></span></label>
						{/each}
					</div>
				</div>
			</details>
			</div>
			<input disabled={!interactive} type="hidden" name="albums" value={selectedAlbums.join(',')} />
			<input disabled={!interactive} type="hidden" name="scope" value={selectedAlbums.length > 1 ? 'selected' : selectedAlbums.length === 1 ? 'album' : 'all'} />
			<label class="report-field">Period<select disabled={!interactive} name="period" class="control" bind:value={period}><option value="7">Last 7 complete days</option><option value="30">Last 30 complete days</option><option value="90">Last 90 complete days</option><option value="custom">Custom dates</option></select></label>
			<label class="report-field">Measure<select disabled={!interactive} name="measure" class="control" value={report.query.measure}><option value="photo_opens">Photo opens</option><option value="album_opens">Album opens</option><option value="downloads">Download actions</option><option value="favorites">Favorites</option><option value="shares">Shares</option></select></label>
			<button class="action-primary col-span-2 self-end md:col-span-1" disabled={!interactive} type="submit"><Filter class="size-4" /> Apply</button>
		</div>
		{#if period === 'custom'}
			<div class="mt-3 grid grid-cols-2 gap-3"><label class="report-field">Activity starts<input disabled={!interactive} class="control min-w-0" type="date" name="start" value={report.query.start} /></label><label class="report-field">Activity ends<input disabled={!interactive} class="control min-w-0" type="date" name="end" value={report.query.end} /></label></div>
		{/if}
		<details class="mt-3 border-t border-charcoal-700 pt-3">
			<summary class="cursor-pointer text-sm font-medium text-gold-300">Advanced filters{activeFilterCount ? ` · ${activeFilterCount} active` : ''}</summary>
			<div class="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
				<label class="report-field">Traffic<select disabled={!interactive} class="control" name="traffic" value={report.query.traffic}><option value="conservative">Audience + unclassified</option><option value="inclusive">Include controlled and automated</option></select></label>
				<label class="report-field">Sport<select disabled={!interactive} class="control" name="sport"><option value="">Any sport</option>{#each data.facets.sports as sport}<option value={sport} selected={report.query.sport === sport}>{sport}</option>{/each}</select></label>
				<label class="report-field">Photo category<select disabled={!interactive} class="control" name="category"><option value="">Any category</option>{#each data.facets.categories as category}<option value={category} selected={report.query.category === category}>{category}</option>{/each}</select></label>
				<label class="report-field">Arrival or open source<select disabled={!interactive} class="control" name="source"><option value="">Any source</option><option value="direct" selected={report.query.source==='direct'}>Unknown / no tag</option>{#each sourceOptions as source}<option value={source} selected={report.query.source === source}>{source}</option>{/each}</select></label>
				<label class="report-field">Album event date<input disabled={!interactive} class="control" name="event_date" type="date" value={report.query.eventDate ?? ''} /></label>
				<label class="report-field">Season<select disabled={!interactive} class="control" name="season"><option value="">Any season</option>{#each data.facets.seasons as season}<option value={season} selected={report.query.season === season}>{season}</option>{/each}</select></label>
				<label class="report-field">Album event type<select disabled={!interactive} class="control" name="event_type"><option value="">Any event type</option>{#each data.facets.eventTypes as type}<option value={type} selected={report.query.albumEventType === type}>{type}</option>{/each}</select></label>
				<label class="report-field">Compare<select disabled={!interactive} class="control" name="compare" bind:value={compareMode}><option value="previous">Previous equal period</option><option value="custom">Selected period</option><option value="publication_age">Same age after publication</option><option value="none">No comparison</option></select></label>
				{#if compareMode === 'custom'}<label class="report-field">Comparison starts<input disabled={!interactive} class="control" type="date" name="compare_start" value={report.query.compareStart ?? report.previous.start} /></label><label class="report-field">Comparison ends<input disabled={!interactive} class="control" type="date" name="compare_end" value={report.query.compareEnd ?? report.previous.end} /></label>{/if}
			</div>
		</details>
		<div class="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal-400"><span>America/Chicago</span><a class="text-link" href={`${reportPath(page.url.hostname, 'gallery')}`}>Reset all filters</a></div>
	</form>
 {#if activeFilters}<p class="mt-3 text-sm text-charcoal-300">{activeFilters}</p>{/if}

	{#if !report.available}
		<section class="error-panel" aria-live="polite"><h2>Report unavailable</h2><p>{report.error}</p><p>No total, ranking, or export is being substituted with zero.</p></section>
	{:else}
		{#if activeSection === 'overview'}
		<section id="overview" class="scroll-mt-20 pt-4" aria-labelledby="overview-heading">
			<div class="section-heading"><div><p class="eyebrow">Overview</p><h2 id="overview-heading">{displayMeasure(report.query.measure)}</h2></div><p>{formatDate(report.query.start)}–{formatDate(report.query.end)}</p></div>
			<div class="overview-layout"><div>
			<div class="answer-grid">
				<div class="answer-primary"><span>Recorded actions</span><strong>{report.total === null ? 'Unavailable' : report.total.toLocaleString()}</strong></div>
				<div><span>Browsers with any activity</span><strong>{report.visitorEstimate.value === null ? 'Unavailable' : report.visitorEstimate.value.toLocaleString()}</strong></div>
				<div><span>{report.comparison?.label ?? 'Comparison'}</span><strong>{report.change?.label ?? (report.query.compare === 'publication_age' ? 'See equal-age peers' : report.query.compare==='none' ? 'Not selected' : 'Unavailable')}</strong></div>
				<div><span>Evidence coverage</span><strong class="capitalize">{report.coverage}</strong></div>
			</div>
			<p class="mt-2 text-xs text-charcoal-400">{report.visitorEstimate.limit}</p>
   {#if report.coverage!=='complete'}<p class="coverage-note">This period has {report.coverage} history. {report.observedTotal.toLocaleString()} actions are present in the available records. They are not a complete total; changes are withheld.</p>{/if}
   <div class="freshness-line"><span>Updated {formatTime(report.dataAsOf)}</span><span>Preserved history starts {report.preservedSince?formatDate(report.preservedSince):'at an unknown date'}</span><span>Today · partial: {report.today.count===null?'not available yet':`${report.today.count.toLocaleString()} recorded ${report.query.measure.replaceAll('_',' ')}`}{report.today.asOf?` through ${formatTime(report.today.asOf)}`:''}</span></div></div>

			<div class="overview-trend">
				<AnalyticsTrend points={report.daily} measureLabel={displayMeasure(report.query.measure)} />
				<section class="legacy-trend panel min-w-0"><div class="panel-heading"><div><p class="eyebrow">Trend</p><h3>Daily activity</h3></div><a class="text-link" href={sectionHref('albums')}>See contributing albums</a></div>
					{#if report.daily.length}<div class="chart-wrap"><ol class="daily-chart" style={`grid-template-columns:repeat(${report.daily.length},minmax(1.8rem,1fr))}`} aria-label="Daily activity chart">{#each report.daily as day}<li class="min-w-0"><div class="flex h-32 items-end" title={`${day.date}: ${day.count === null ? `${day.coverage} coverage` : day.count}`}><div class:opacity-30={day.count === null} class="w-full rounded-t bg-gold-500/70" style={`height:${day.count === null ? 6 : Math.max(6, Math.round((day.count / Math.max(1, ...report.daily.map((item) => item.count ?? 0))) * 100))}%`}></div></div><span class="mt-1 block truncate text-[10px] text-charcoal-400">{day.date.slice(5)}</span><span class="block text-xs text-charcoal-200">{day.count === null ? '—' : day.count}</span></li>{/each}</ol></div>
						<details class="mt-4"><summary class="text-link cursor-pointer">Read as a table</summary><p class="table-hint">Scroll sideways for every column. The first column stays visible.</p><div tabindex="-1" role="region" aria-label="Scrollable analytics table" class="table-wrap mt-2"><table><thead><tr><th>Date</th><th class="numeric">Count</th><th>Coverage</th><th>Sharing context</th></tr></thead><tbody>{#each report.daily as day}<tr><td>{formatDate(day.date)}</td><td class="numeric">{day.count ?? '—'}</td><td class="capitalize">{day.coverage}</td><td>{data.annotations.filter(note=>note.activity_date===day.date).map(note=>`${note.channel}: ${note.note}`).join('; ') || '—'}</td></tr>{/each}</tbody></table></div></details>
					{:else}<p class="empty-copy">No daily source is available for this report.</p>{/if}
				</section>
				<section class="traffic-summary panel"><div class="panel-heading"><div><p class="eyebrow">Traffic</p><h3>Included and excluded activity</h3></div><ShieldCheck class="size-5 text-gold-400" /></div>
					<dl class="mt-4 space-y-3">{#each report.traffic as item}<div class="flex justify-between border-b border-charcoal-800 pb-2"><dt class="capitalize text-charcoal-300">{item.classification==='unclassified'?'Unclassified audience':item.classification.replaceAll('_', ' ')}</dt><dd class="font-medium tabular-nums text-charcoal-100">{item.count.toLocaleString()}</dd></div>{/each}</dl>
					<p class="mt-4 text-xs text-charcoal-400">The default report excludes operator, test, known crawler, and suspected automated activity. These counts show every class for the same dates, albums, and measure. Unclassified remains visible and is not labeled human.</p>
				</section>
			</div></div>
			<div class="overview-next">
				<section class="panel overview-ranking" aria-labelledby="leading-albums-title">
					<div class="panel-heading"><div><p class="eyebrow">Compare</p><h3 id="leading-albums-title">Albums getting attention</h3></div><a class="text-link" href={sectionHref('albums')}>All albums</a></div>
					<p class="overview-caption">Ranked by recorded {displayMeasure(report.query.measure).toLowerCase()} in this period.</p>
					{#if leadingAlbums.length}<ol class="overview-albums">{#each leadingAlbums as album, index}<li><span class="rank-number">{index + 1}</span><button type="button" onclick={() => { selectAlbum(album); openSection('albums'); }}><strong>{album.name}</strong><span>{album.photoCount.toLocaleString()} photos · inspect album</span></button><strong class="rank-count">{album.count?.toLocaleString()}</strong></li>{/each}</ol>{:else}<p class="empty-copy">No album activity is available for this selection.</p>{/if}
				</section>
				<section class="panel overview-ranking" aria-labelledby="leading-photos-title">
					<div class="panel-heading"><div><p class="eyebrow">Discover</p><h3 id="leading-photos-title">Photos drawing attention</h3></div><a class="text-link" href={sectionHref('photos')}>Explore photos</a></div>
					<p class="overview-caption">These are response signals, not a rating of photographic quality.</p>
					{#if leadingPhotos.length}<div class="overview-photos">{#each leadingPhotos as photo}<a href={`${reportHref({ section: 'photos', photo_page: '0', photo_rank: 'popular' })}#photos`}><span class="overview-thumb">{#if photo.imageUrl}<img src={photo.imageUrl} alt="" />{:else}<span>No preview</span>{/if}</span><span class="overview-photo-copy"><strong>{data.albumCatalogue.find((album) => album.album_key === photo.albumKey)?.album_name ?? 'Gallery photo'}</strong><span>{photo.count?.toLocaleString()} recorded {displayMeasure(report.query.measure).toLowerCase()}</span></span></a>{/each}</div>{:else}<p class="empty-copy">No photo activity is available for this selection.</p>{/if}
				</section>
			</div>
		</section>
		{/if}

		{#if activeSection === 'albums'}
		<section id="albums" class="panel mt-6 min-w-0 scroll-mt-20"><div class="panel-heading"><div><p class="eyebrow">Albums</p><h2>Compare albums</h2><p class="mt-1 text-xs text-charcoal-400">Compare the same activity dates. Select an album for a quick summary or open its photos.</p></div><label class="relative min-w-0 sm:w-72"><span class="sr-only">Search album table</span><Search class="absolute left-3 top-3 size-4 text-charcoal-500" /><input disabled={!interactive} class="control pl-9" bind:value={albumTableSearch} placeholder="Find an album" /></label></div>
			{#if report.query.compare === 'publication_age'}<div class="mt-5"><h3 class="text-lg font-semibold text-charcoal-100">First {report.publicationAge.days} days after publication</h3><p class="mt-1 text-sm text-charcoal-400">{report.publicationAge.label}</p>{#if report.publicationAge.albums.length}<p class="table-hint">Scroll sideways for every column. The first column stays visible.</p><div tabindex="-1" role="region" aria-label="Scrollable analytics table" class="table-wrap mt-3"><table><thead><tr><th>Album</th><th>Published</th><th class="numeric">Equal-age total</th><th>Coverage</th></tr></thead><tbody>{#each report.publicationAge.albums as album}<tr><td>{data.albumCatalogue.find((item) => item.album_key === album.albumKey)?.album_name ?? album.albumKey}</td><td>{formatDate(album.publishedAt)}</td><td class="numeric">{album.total ?? '—'}</td><td class="capitalize">{album.coverage}</td></tr>{/each}</tbody></table></div>{/if}{#if report.publicationAge.albums.length}<details class="mt-3"><summary class="text-link cursor-pointer">Daily comparison from publication</summary><p class="table-hint">Scroll sideways for every column. The first column stays visible.</p><div tabindex="-1" role="region" aria-label="Scrollable analytics table" class="table-wrap mt-3"><table><thead><tr><th>Day after publication</th>{#each report.publicationAge.albums as album}<th>{data.albumCatalogue.find(a=>a.album_key===album.albumKey)?.album_name??album.albumKey}</th>{/each}</tr></thead><tbody>{#each Array.from({length:report.publicationAge.days},(_,i)=>i) as day}<tr><td>Day {day+1}</td>{#each report.publicationAge.albums as album}<td class="numeric">{album.series[day]??'Unavailable'}</td>{/each}</tr>{/each}</tbody></table></div></details>{/if}{#if report.publicationAge.missingAlbumKeys.length}<p class="mt-2 text-xs text-charcoal-400">{report.publicationAge.missingAlbumKeys.length} selected album{report.publicationAge.missingAlbumKeys.length === 1 ? '' : 's'} lack a recorded publication time and are excluded.</p>{/if}</div>{/if}
			{#if data.albumCatalogueAvailable && albumRows.length}<div class="album-workspace mt-4"><AlbumComparisonTable rows={visibleAlbumRows} selectedKey={selectedAlbumKey} measure={report.query.measure} measureLabel={displayMeasure(report.query.measure)} risingAvailable={report.rising.available} onselect={selectAlbum} reportHref={(albumKey) => reportHref({ scope: 'album', albums: albumKey }) + '#albums'} /><AlbumInspector row={selectedAlbumDetail} reportHref={(albumKey) => reportHref({ scope: 'album', albums: albumKey })} /></div>{:else}<p class="empty-copy">{data.albumCatalogueAvailable?'No albums match this report.':'The album catalogue is unavailable. Missing albums are not being shown as zero activity.'}</p>{/if}
			{#if albumRows.length > albumPageSize}
				<nav class="result-pager" aria-label="Album pages">
					<p>Showing {albumPage * albumPageSize + 1}–{Math.min((albumPage + 1) * albumPageSize, albumRows.length)} of {albumRows.length} matching albums</p>
					<div><button class="action-secondary" type="button" disabled={albumPage === 0} onclick={() => changeAlbumPage(albumPage - 1)}>Previous</button><span>Page {albumPage + 1} of {albumPageCount}</span><button class="action-secondary" type="button" disabled={albumPage + 1 >= albumPageCount} onclick={() => changeAlbumPage(albumPage + 1)}>Next</button></div>
				</nav>
			{/if}
		</section>
		{/if}

		{#if activeSection === 'photos'}
		<section id="photos" class="panel mt-6 min-w-0 scroll-mt-20"><div class="panel-heading"><div><p class="eyebrow">Photos</p><h2>Popular, rising, and recently active</h2><p class="mt-1 text-sm text-charcoal-400">Ranked by {displayMeasure(report.query.measure).toLowerCase()} in the selected dates. Popularity measures audience response, not photography quality.</p></div><div class="flex flex-wrap gap-2"><button class="icon-toggle" class:active={photoView === 'images'} type="button" onclick={() => setPhotoView('images')}><Images class="size-4" /> Images</button><button class="icon-toggle" class:active={photoView === 'table'} type="button" onclick={() => setPhotoView('table')}><List class="size-4" /> Table</button></div></div>
				<div class="mt-4 flex flex-wrap items-center justify-between gap-3"><div class="segmented" role="group" aria-label="Photo ranking"><a aria-current={photoRank === 'popular' ? 'page' : undefined} href={`${reportHref({ section: 'photos', photo_page: '0', photo_rank: 'popular' })}#photos`}>Popular</a>{#if report.rising.available}<a aria-current={photoRank === 'rising' ? 'page' : undefined} href={`${reportHref({ section: 'photos', photo_page: '0', photo_rank: 'rising' })}#photos`}>Rising</a>{:else}<span aria-disabled="true">Rising</span>{/if}<a aria-current={photoRank === 'recent' ? 'page' : undefined} href={`${reportHref({ section: 'photos', photo_page: '0', photo_rank: 'recent' })}#photos`}>Recently active</a></div><details><summary class="text-link cursor-pointer">Choose table columns</summary><div class="column-menu">{#each Object.entries(columns) as [key, shown]}<label><input disabled={!interactive} type="checkbox" checked={shown} onchange={() => (columns[key as keyof typeof columns] = !columns[key as keyof typeof columns])} /> {key}</label>{/each}</div></details></div>
			{#if !report.rising.available}<p class="coverage-note">{report.rising.label}</p>{:else if report.rising.basis === 'daily_rate'}<p class="coverage-note">{report.rising.label}</p>{/if}
			{#if visiblePhotos.length}
				{#if photoView === 'images'}<div class="photo-grid mt-4">{#each visiblePhotos as photo}<article class:selected={shortlist.includes(photo.photoId)} class="photo-card"><button type="button" class="photo-inspect" disabled={!interactive} onclick={(event) => void openPhoto(photo, event.currentTarget)}>{#if photo.imageUrl}<img src={photo.imageUrl} alt={`Gallery preview for photo ${photo.photoId}`} />{:else}<span>No image available</span>{/if}<span class="photo-count">{countLabel(photo.count)}</span></button><div class="photo-card-details p-3"><div class="min-w-0"><p class="truncate text-sm text-charcoal-100">{data.albumCatalogue.find((album) => album.album_key === photo.albumKey)?.album_name ?? 'Album'}</p><p class="text-xs text-charcoal-400">{photoRank==='recent'?formatTime(photo.lastActivity):`${changeLabel(photo)} · previous ${photo.previousCount??'unavailable'}`}</p></div><label class="shortlist-check"><input disabled={!interactive} type="checkbox" checked={shortlist.includes(photo.photoId)} onchange={() => toggleShortlist(photo.photoId)} /><span>Shortlist</span></label></div></article>{/each}</div>
				{:else}<p class="table-hint">Scroll sideways for every column. The first column stays visible.</p><div tabindex="-1" role="region" aria-label="Scrollable analytics table" class="table-wrap mt-4"><table><thead><tr><th>Photo</th>{#if columns.album}<th>Album</th>{/if}{#if columns.current}<th class="numeric">Current</th>{/if}{#if columns.previous}<th class="numeric">Previous</th>{/if}{#if columns.change}<th class="numeric">Change</th>{/if}{#if columns.latest}<th>Latest activity</th>{/if}</tr></thead><tbody>{#each visiblePhotos as photo}<tr class:selected={shortlist.includes(photo.photoId)}><td><button class="thumbnail-button" disabled={!interactive} type="button" aria-label={`Inspect ${photo.photoId}`} onclick={(event) => void openPhoto(photo, event.currentTarget)}>{#if photo.imageUrl}<img src={photo.imageUrl} alt="" />{:else}Inspect{/if}</button>{#if columns.identity}<p class="mt-1 font-mono text-xs">{photo.photoId}</p>{/if}<label class="shortlist-check"><input disabled={!interactive} type="checkbox" aria-label={`Add ${photo.photoId} to shortlist`} checked={shortlist.includes(photo.photoId)} onchange={() => toggleShortlist(photo.photoId)} /><span>Shortlist</span></label></td>{#if columns.album}<td>{data.albumCatalogue.find((album) => album.album_key === photo.albumKey)?.album_name ?? photo.albumKey}</td>{/if}{#if columns.current}<td class="numeric">{countLabel(photo.count)}</td>{/if}{#if columns.previous}<td class="numeric">{photo.previousCount??"Unavailable"}</td>{/if}{#if columns.change}<td class="numeric">{changeLabel(photo)}</td>{/if}{#if columns.latest}<td>{formatTime(photo.lastActivity)}</td>{/if}</tr>{/each}</tbody></table></div>{/if}
			{:else}<p class="empty-copy">No photo actions match this report. Album-only actions are available in the album report and full export.</p>{/if}
				<div class="mt-4 flex flex-wrap items-center gap-2">{#if photoPage > 0}<a class="action-secondary" href={`${reportHref({ section: 'photos', photo_page: String(photoPage - 1), photo_rank: photoRank })}#photos`}>Previous</a>{:else}<span class="action-secondary" aria-disabled="true">Previous</span>{/if}<span class="text-sm text-charcoal-400">Page {photoPage + 1} of {photoPageCount}</span>{#if photoPage + 1 < photoPageCount}<a class="action-secondary" href={`${reportHref({ section: 'photos', photo_page: String(photoPage + 1), photo_rank: photoRank })}#photos`}>Next</a>{:else}<span class="action-secondary" aria-disabled="true">Next</span>{/if}<a class="action-primary" href={`${reportPath(page.url.hostname, 'gallery', '/export.csv')}?${queryString}`}><Download class="size-4" /> Export CSV · {report.query.measure==='album_opens'?report.albums.length.toLocaleString(): (photoTotal+report.albumOnlyActions.length).toLocaleString()} rows</a>{#if shortlist.length}<a class="action-secondary" href={shortlistExportUrl()}><Download class="size-4" /> Shortlist CSV ({shortlist.length})</a>{/if}</div>
		</section>
		{/if}

		{#if activeSection === 'sources'}
		<section id="sources" class="mt-6 grid min-w-0 scroll-mt-20 gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
			<div class="panel"><div class="panel-heading"><div><p class="eyebrow">Sources</p><h2>Tagged arrivals</h2></div><Share2 class="size-5 text-gold-400" /></div>{#if report.sources.arrivals.length}<ul class="source-list">{#each report.sources.arrivals as item}<li><span>{item.source}</span><strong>{item.count.toLocaleString()}</strong></li>{/each}</ul>{:else}<p class="empty-copy">No tagged arrival records match this report.</p>{/if}<p class="mt-3 text-xs text-charcoal-400">Arrival and entry-point counts cover all opening events in these dates and filters. An arrival tag does not prove that a later action was caused by that channel.</p></div>
			<div class="panel"><div class="panel-heading"><div><p class="eyebrow">Open locations</p><h2>Where albums and photos were opened</h2></div></div>{#if report.sources.openLocations.length}<ul class="source-list">{#each report.sources.openLocations as item}<li><span>{item.source}</span><strong>{item.count.toLocaleString()}</strong></li>{/each}</ul>{:else}<p class="empty-copy">No internal open-location records match this report.</p>{/if}{#if report.sources.unknown}<p class="mt-3 text-sm text-charcoal-300">Actions without a source: {report.sources.unknown.toLocaleString()}</p>{/if}</div>
			<div class="panel xl:col-span-2"><p class="eyebrow">Linked visits</p><h2>What happened after a tagged arrival</h2>
				<p class="mt-2 text-sm text-charcoal-400">For browsers that allowed linked analytics. Each action column counts visits with that action after arrival. A visit can appear under more than one tag; these rows cannot be added together.</p>
				{#if sourceJourney?.available && sourceJourney.breakdown.length}
					<p class="table-hint">Scroll sideways for every column. The source stays visible.</p>
					<div class="table-wrap mt-3" role="region" aria-label="Tagged arrival actions" tabindex="0"><table><thead><tr><th>Source tag</th><th class="numeric">Arrival visits</th><th class="numeric">Album opens</th><th class="numeric">Photo opens</th><th class="numeric">Download requests</th><th class="numeric">Favorites</th><th class="numeric">Returning browsers</th></tr></thead><tbody>
					{#each sourceJourney.breakdown as row}<tr><td>{row.source}</td><td class="numeric">{row.tagged_arrival_visits}</td><td class="numeric">{row.subsequent_album_open_visits}</td><td class="numeric">{row.subsequent_photo_open_visits}</td><td class="numeric">{row.subsequent_download_request_visits}</td><td class="numeric">{row.subsequent_favorite_visits}</td><td class="numeric">{row.before_window_returning_browsers}</td></tr>{/each}
					</tbody></table></div><p class="mt-3 text-xs text-charcoal-400">Returning means observed before this period within the 90-day lookback. As of {formatTime(sourceJourney.asOf)}. These are associations, not proof that a channel caused an action.</p>
				{:else}<p class="empty-copy">{sourceJourney?.available ? 'No tagged linked visits match these filters.' : 'Linked source results are unavailable. The opening counts above remain available.'}</p>{/if}
			</div>

			{#if data.user}
			<div class="panel"><div class="panel-heading"><div><p class="eyebrow">Private note</p><h2>Add sharing context</h2></div></div><form method="POST" action={actionHref('addAnnotation')} class="mt-4 grid gap-3"><label class="report-field">Album<select disabled={!interactive} class="control" name="albumKey" required><option value="">Choose an album</option>{#each data.albumCatalogue as album}<option value={album.album_key}>{album.album_name}</option>{/each}</select></label><label class="report-field">Activity date<input disabled={!interactive} class="control" name="activityDate" type="date" value={report.query.end} required /></label><label class="report-field">Channel<input disabled={!interactive} class="control" name="channel" placeholder="Instagram story" required /></label><label class="report-field">What happened<textarea disabled={!interactive} class="control min-h-24" name="note" required></textarea></label><button class="action-primary w-fit" disabled={!interactive} type="submit">Save note</button>{#if form?.annotationError}<p role="alert" class="text-sm text-red-300">{String(form.annotationError)}</p>{/if}</form>
				{#if data.annotationsAvailable && data.annotations.length}<ul class="mt-5 space-y-3">{#each data.annotations as annotation}<li class="border-l-2 border-gold-500 pl-3"><p class="text-xs text-charcoal-400">{data.albumCatalogue.find((album) => album.album_key === annotation.album_key)?.album_name ?? 'Album'} · {formatDate(annotation.activity_date)}</p><form method="POST" action={actionHref('updateAnnotation')} class="mt-2 grid gap-2"><input disabled={!interactive} type="hidden" name="id" value={annotation.id} /><label class="report-field">Channel<input disabled={!interactive} class="control" name="channel" value={annotation.channel} required /></label><label class="report-field">Note<textarea disabled={!interactive} class="control min-h-20" name="note" value={annotation.note} required></textarea></label><div class="flex gap-3"><button class="text-link" disabled={!interactive} type="submit">Update</button></div></form><form method="POST" action={actionHref('deleteAnnotation')} class="mt-1"><input disabled={!interactive} type="hidden" name="id" value={annotation.id} /><button class="text-link text-red-300" disabled={!interactive} type="submit">Delete note</button></form></li>{/each}</ul>{:else}<p class="empty-copy">{data.annotationsAvailable?'No private sharing notes match this interval.':'Sharing notes could not be loaded.'}</p>{/if}</div>
			<div class="panel"><div class="panel-heading"><div><p class="eyebrow">Saved views</p><h2>Repeat this analysis</h2></div><Save class="size-5 text-gold-400" /></div><form method="POST" action={`?/saveReport&${queryString}#sources`} class="mt-4 flex min-w-0 flex-col gap-2 sm:flex-row"><label class="sr-only" for="report-name">View name</label><input disabled={!interactive} id="report-name" class="control min-w-0 flex-1" name="name" maxlength="100" required placeholder="Name this view" /><button class="action-primary" disabled={!interactive} type="submit">Save view</button></form>{#if form?.updateError || form?.deleteError}<p role="alert" class="mt-2 text-sm text-red-300">{String(form.updateError ?? form.deleteError)}</p>{/if}{#if form?.saveError}<p role="alert" class="mt-2 text-sm text-red-300">{String(form.saveError)}</p>{/if}{#if data.savedReportsAvailable && data.savedReports.length}<ul class="mt-5 space-y-2">{#each data.savedReports as saved}<li class="flex flex-wrap items-center justify-between gap-3 border-b border-charcoal-800 pb-2"><a class="text-link" href={savedHref(saved.query)}>{saved.name}</a><div class="flex gap-3"><form method="POST" action={`?/updateReport&${queryString}#sources`}><input disabled={!interactive} type="hidden" name="id" value={saved.id} /><button class="text-link" disabled={!interactive} type="submit">Update</button></form><form method="POST" action={actionHref('deleteReport')}><input disabled={!interactive} type="hidden" name="id" value={saved.id} /><button class="text-link text-red-300" disabled={!interactive} type="submit">Delete</button></form></div></li>{/each}</ul>{:else}<p class="empty-copy">{data.savedReportsAvailable?'No saved views yet.':'Saved views could not be loaded.'}</p>{/if}<p class="mt-4 text-xs text-charcoal-400">A saved view stores filters, not frozen numbers.</p></div>
			{/if}
		</section>
		{/if}

		{#if activeSection === 'measurement'}
		<section id="measurement" class="mt-6 min-w-0 scroll-mt-20 space-y-6">
	   <div class="panel"><p class="eyebrow">External cross-check</p><h2>Cloudflare comparison is unresolved</h2><p class="mt-2 text-sm text-charcoal-300">The September 28, 2026 audit could not establish matching album-route coverage for the September 21–27 week. This is a dated audit, not a live provider connection.</p><details class="mt-3"><summary class="text-link cursor-pointer">What this means for these numbers</summary><p class="mt-2 text-sm text-charcoal-400">Cloudflare pageviews and these deduplicated actions have different definitions. Similar totals would not prove accuracy. These reports use accepted first-party events; controlled collection, retry, and aggregation checks establish what they count. A recorded action still does not prove a human viewer or a completed download.</p></details></div>
	   <div class="panel"><div class="panel-heading"><div><p class="eyebrow">Traffic</p><h2>Included and excluded activity</h2></div><ShieldCheck class="size-5 text-gold-400" /></div><dl class="mt-4 space-y-3">{#each report.traffic as item}<div class="flex justify-between border-b border-charcoal-800 pb-2"><dt class="capitalize text-charcoal-300">{item.classification==='unclassified'?'Unclassified audience':item.classification.replaceAll('_', ' ')}</dt><dd class="font-medium tabular-nums text-charcoal-100">{item.count.toLocaleString()}</dd></div>{/each}</dl><p class="mt-4 text-xs text-charcoal-400">The default report excludes operator, test, known crawler, and suspected automated activity. These counts show every class for the same dates, albums, and measure. Unclassified remains visible and is not labeled human.</p></div>

	   <div class="panel"><p class="eyebrow">How counting works</p><h2>Repeated actions are counted once per day</h2><p class="mt-2 text-sm text-charcoal-300">The overview, albums, and photos count a browser’s repeated action on the same photo or album once per day. Their selected-period coverage is <strong class="capitalize">{report.coverage}</strong>. These totals cannot tell us which steps someone followed.</p><dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt class="text-charcoal-400">Photo opens</dt><dd class="mt-1 font-medium">{countLabel(legacyMeasureTotal('photo_opens'))}</dd></div><div><dt class="text-charcoal-400">Album opens</dt><dd class="mt-1 font-medium">{countLabel(legacyMeasureTotal('album_opens'))}</dd></div><div><dt class="text-charcoal-400">Downloads, favorites, shares</dt><dd class="mt-1 font-medium">{countLabel(legacyEngagementTotal())}</dd></div></dl></div>

	   <div class="panel"><div class="panel-heading"><div><p class="eyebrow">Delivery health</p><h2>Collection and provider delivery</h2></div><ShieldCheck class="size-5 text-gold-400" /></div>{#if data.measurementHealth.available}<dl class="mt-4 grid gap-3 text-sm sm:grid-cols-3"><div><dt class="text-charcoal-400">Collection, last 30 days</dt><dd class="mt-1 font-medium">{data.measurementHealth.accepted ?? '—'} accepted · {data.measurementHealth.rejected ?? '—'} rejected · {data.measurementHealth.duplicate ?? '—'} duplicate</dd></div><div><dt class="text-charcoal-400">Outbox</dt><dd class="mt-1 font-medium">{data.measurementHealth.pending ?? '—'} pending · {data.measurementHealth.submitted ?? '—'} submitted · {data.measurementHealth.confirmed ?? '—'} confirmed · {data.measurementHealth.failed ?? '—'} failed</dd></div><div><dt class="text-charcoal-400">Event version and traffic corrections</dt><dd class="mt-1 font-medium">v{data.measurementHealth.schemaVersion ?? '—'} · {data.measurementHealth.controlPending ?? '—'} corrections waiting</dd></div><div><dt class="text-charcoal-400">Oldest pending</dt><dd class="mt-1 font-medium">{data.measurementHealth.pending === 0 && data.measurementHealth.failed === 0 ? 'No events waiting' : formatTime(data.measurementHealth.oldestPendingAt)}</dd></div><div><dt class="text-charcoal-400">Oldest submitted</dt><dd class="mt-1 font-medium">{data.measurementHealth.submitted === 0 ? 'None awaiting confirmation' : formatTime(data.measurementHealth.oldestSubmittedAt)}</dd></div><div><dt class="text-charcoal-400">Most recent confirmed event</dt><dd class="mt-1 font-medium">{formatTime(data.measurementHealth.confirmedWatermark)}</dd></div></dl>{:else}<p class="coverage-note">Delivery health is unavailable. This is not a zero or healthy result.</p>{/if}<p class="mt-3 text-sm text-charcoal-300">{data.providerQueryFreshness.label}</p><p class="mt-2 text-xs text-charcoal-400">Quota and billing state: <strong>unknown</strong>. This page does not infer a quota, spend, or authorization from delivery counts.</p></div>

	   <div class="panel"><p class="eyebrow">Volume estimate</p><h2>Observed eligible event rate</h2>{#if data.measurementHealth.forecast30Days !== null}<p class="mt-2 text-sm text-charcoal-300">About <strong>{data.measurementHealth.forecast30Days.toLocaleString()} eligible observations</strong> in a future 30-day period at the measured rate.</p>{:else}<p class="coverage-note">No estimate is available.</p>{/if}<p class="mt-2 text-xs text-charcoal-400">{data.measurementHealth.forecastLimit} It is an event-volume estimate, not people, provider quota, cost, or spend approval.</p></div>

	   <div class="panel"><p class="eyebrow">Detailed observations</p><h2>Recorded event counts</h2>{#if data.v2Report.available}<p class="mt-3 text-sm text-charcoal-400">{data.v2Report.coverage.label}</p><details class="mt-4"><summary class="text-link cursor-pointer">Inspect every event count</summary><div tabindex="-1" role="region" aria-label="Version 2 event counts" class="table-wrap mt-3"><table><thead><tr><th>Event</th><th class="numeric">Recorded observations</th></tr></thead><tbody>{#each data.v2Report.counts as count}<tr><td>{count.label}</td><td class="numeric">{count.count.toLocaleString()}</td></tr>{/each}</tbody></table></div></details>{:else}<p class="coverage-note">{data.v2Report.coverage.label}</p>{/if}</div>

	   <div class="panel"><p class="eyebrow">Linked journeys</p><h2>How visitors use the gallery</h2><p class="mt-2 text-sm text-charcoal-400">These reports connect actions only for browsers that allowed linked analytics. Album and content filters match the actions and their related steps. Source filters require a tagged arrival in the same visit. Journey totals use their own denominators and can differ from the action counts above. They describe that measured group, not every visitor.</p><div class="mt-4 grid gap-3">{#each data.journeys as journey}<details class="journey-job"><summary><span>{journey.report.replaceAll('_', ' ')}</span><span class:journey-unavailable={!journey.available}>{journey.available ? 'Available' : journey.error === 'provider_unavailable' ? 'Provider unavailable' : 'Unavailable'}</span></summary><p class="mt-3 text-sm text-charcoal-400">{journey.coverage.cohort}. Excludes {journey.coverage.excluded}. {journey.coverage.metadata}</p>{#if journey.available}<dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2">{#each Object.entries(journey.totals) as [label, value]}<div class="flex justify-between gap-4 border-b border-charcoal-800 pb-2"><dt>{journey.report === 'search_usefulness' && label === 'searches_shown' && journey.totals.zero_result_searches === null ? 'Search result sets with a matching selection' : label.replaceAll('_', ' ')}</dt><dd class="font-medium tabular-nums">{value === null ? 'Unavailable' : value.toLocaleString()}</dd></div>{/each}</dl><p class="mt-3 text-xs text-charcoal-400">As of {formatTime(journey.asOf)} · {journey.coverage.start}–{journey.coverage.end} · version {journey.coverage.definitionVersion}</p>{:else}<p class="coverage-note">This report has no verified result for the current settings.</p>{/if}</details>{/each}</div></div>

   <div class="panel"><div class="panel-heading"><div><p class="eyebrow">Traffic impact</p><h2>Which album rankings change</h2></div></div><p class="mt-2 text-sm text-charcoal-400">Same dates, content filters, and measure. Audience includes unclassified traffic. Excluded actions are operator, test, known crawler, or suspected automation.</p>{#if report.trafficImpact.length}<p class="table-hint">Scroll sideways for every column. The first column stays visible.</p><div tabindex="-1" role="region" aria-label="Scrollable analytics table" class="table-wrap mt-4"><table><thead><tr><th>Album</th><th class="numeric">All traffic</th><th class="numeric">Audience</th><th class="numeric">Excluded</th><th>Rank: all → audience</th></tr></thead><tbody>{#each visibleImpactRows as item}<tr><td><a class="text-link" href={reportHref({scope:'album',albums:item.albumKey})}>{data.albumCatalogue.find(a=>a.album_key===item.albumKey)?.album_name??item.albumKey}</a></td><td class="numeric">{item.inclusive}</td><td class="numeric">{item.conservative}</td><td class="numeric">{item.excluded}</td><td>{item.inclusiveRank} → {item.conservativeRank}</td></tr>{/each}</tbody></table></div>{#if report.trafficImpact.length > impactPageSize}<nav class="result-pager" aria-label="Traffic impact pages"><p>Showing {impactPage * impactPageSize + 1}–{Math.min((impactPage + 1) * impactPageSize, report.trafficImpact.length)} of {report.trafficImpact.length} albums</p><div><button class="action-secondary" type="button" disabled={impactPage === 0} onclick={() => (impactPage -= 1)}>Previous</button><span>Page {impactPage + 1} of {impactPageCount}</span><button class="action-secondary" type="button" disabled={impactPage + 1 >= impactPageCount} onclick={() => (impactPage += 1)}>Next</button></div></nav>{/if}{:else}<p class="empty-copy">No recorded actions match these filters.</p>{/if}</div>

			<div class="panel"><div class="panel-heading"><div><p class="eyebrow">Measurement</p><h2>Search and download evidence</h2></div><TrendingUp class="size-5 text-gold-400" /></div>{#if report.diagnostics.length}<p class="table-hint">Scroll sideways for every column. The first column stays visible.</p><div tabindex="-1" role="region" aria-label="Scrollable analytics table" class="table-wrap mt-4"><table><thead><tr><th>Path</th><th>Status</th><th class="numeric">Recorded</th><th class="numeric">Results</th><th>Error categories</th><th>Latest evidence</th></tr></thead><tbody>{#each report.diagnostics as item}<tr><td>{item.type}</td><td>{item.status}</td><td class="numeric">{item.count}</td><td class="numeric">{item.resultCount ?? '—'}</td><td>{item.errorCodes.length ? item.errorCodes.join(', ') : '—'}</td><td>{formatTime(item.latestAt)}</td></tr>{/each}</tbody></table></div>{:else}<p class="empty-copy">No diagnostic rows match this interval. That is not evidence that nothing happened.</p>{/if}<p class="mt-3 text-sm" class:text-red-300={!!report.diagnosticsCoverage.error} class:text-charcoal-300={!report.diagnosticsCoverage.error}>{report.diagnosticsCoverage.label}</p><p class="mt-2 text-xs text-charcoal-400">Content grouping: {report.catalogueBasis.replaceAll('_',' ')}. Event snapshots preserve catalogue facts when recorded; backfilled rows preserve facts available at the first backfill. Search text and visitor identifiers are never shown. Browser downloads record requests and failures, not completed transfers.</p></div>
			{#if data.user}
			<div class="panel"><div class="panel-heading"><div><p class="eyebrow">Version 2 corrections</p><h2>Correct retained v2 evidence</h2></div></div><p class="mt-2 text-sm text-charcoal-400">This private trail changes first-party v2 aggregation immediately. Pending exports are suppressed. If the original UUID was already submitted, a server-created provider control carries only that UUID, version, and classification.</p>{#if !data.v2EvidenceEventsAvailable}<p role="alert" class="coverage-note">Version 2 evidence could not be loaded.</p>{:else if !data.v2EvidenceEvents.length}<p class="empty-copy">No retained v2 evidence matches these dates and albums.</p>{/if}<form method="POST" action={actionHref('correctV2Classification')} class="mt-4 grid gap-3 lg:grid-cols-[minmax(16rem,1.4fr)_minmax(12rem,.7fr)_minmax(14rem,1fr)_auto]"><label class="report-field">Retained v2 event<select disabled={!interactive} class="control" name="eventId" required><option value="">Choose an event</option>{#each data.v2EvidenceEvents as event}<option value={event.event_id}>{data.albumCatalogue.find((album) => album.album_key === event.album_key)?.album_name ?? 'Gallery'} · {event.event_name.replaceAll('_', ' ')} · {formatTime(event.occurred_at)}</option>{/each}</select></label><label class="report-field">Classification<select disabled={!interactive} class="control" name="classification"><option value="audience">Audience</option><option value="operator">Operator</option><option value="test">Test</option><option value="known_crawler">Known crawler</option><option value="suspected_automation">Suspected automation</option><option value="unclassified">Unclassified</option><option value="self_excluded">Self excluded</option></select></label><label class="report-field">Private evidence<input disabled={!interactive} class="control" name="note" maxlength="1000" required /></label><button class="action-primary self-end" disabled={!interactive} type="submit">Record v2 correction</button></form>{#if form?.v2CorrectionError}<p role="alert" class="mt-2 text-sm text-red-300">{String(form.v2CorrectionError)}</p>{/if}{#if data.v2CorrectionLogAvailable && data.v2CorrectionLog.length}<p class="table-hint">Scroll sideways for every column. The first column stays visible.</p><div tabindex="-1" role="region" aria-label="Version 2 correction history" class="table-wrap mt-5"><table><thead><tr><th>Event UUID</th><th>Version</th><th>Classification</th><th>Private evidence</th><th>Action</th></tr></thead><tbody>{#each data.v2CorrectionLog as correction}<tr><td class="font-mono text-xs">{correction.event_id}</td><td class="numeric">{correction.classification_version}</td><td>{correction.classification.replaceAll('_', ' ')}</td><td>{correction.note}</td><td>{#if !correction.reversed && !data.v2CorrectionLog.some((other) => other.event_id === correction.event_id && other.classification_version > correction.classification_version)}<form method="POST" action={actionHref('undoV2Classification')}><input disabled={!interactive} type="hidden" name="eventId" value={correction.event_id} /><button class="text-link" disabled={!interactive} type="submit">Reverse latest</button></form>{:else}<span class="text-charcoal-500">{correction.reversed ? 'Reversal recorded' : 'Earlier version'}</span>{/if}</td></tr>{/each}</tbody></table></div>{/if}</div>
			<div class="panel"><div class="panel-heading"><div><p class="eyebrow">Classification history</p><h2>Correct retained traffic evidence</h2></div></div><p class="mt-2 text-sm text-charcoal-400">Events follow the selected activity dates and album scope. Other content filters do not hide evidence here. Each correction creates a new version and reconciles the affected day.</p><div class="mt-3 flex flex-wrap gap-3 text-sm">{#if data.eventPage>0}<a class="text-link" href={reportHref({event_page:String(data.eventPage-1)})+'#measurement'}>Newer events</a>{/if}<span>Evidence page {data.eventPage+1}</span>{#if data.hasMoreEvents}<a class="text-link" href={reportHref({event_page:String(data.eventPage+1)})+'#measurement'}>Older events</a>{/if}</div>{#if !data.retainedEventsAvailable}<p role="alert" class="text-red-300">Retained events could not be loaded.</p>{:else if !data.retainedEvents.length}<p class="empty-copy">No retained events match these dates and albums.</p>{/if}{#if !data.correctionLogAvailable}<p role="alert" class="text-red-300">Correction history could not be loaded.</p>{/if}<form method="POST" action={actionHref('correctClassification')} class="mt-4 grid gap-3 lg:grid-cols-[minmax(16rem,1.4fr)_minmax(12rem,.7fr)_minmax(14rem,1fr)_auto]"><label class="report-field">Retained event<select disabled={!interactive} class="control" name="eventId" required><option value="">Choose an event</option>{#each data.retainedEvents as event}<option value={event.id}>{data.albumCatalogue.find((album) => album.album_key === event.album_key)?.album_name ?? 'Gallery'} · {event.event_type.replaceAll('_', ' ')} · {formatTime(event.created_at)} · {event.source ?? 'unknown source'}</option>{/each}</select></label><label class="report-field">Classification<select disabled={!interactive} class="control" name="classification"><option value="audience">Audience</option><option value="operator">Operator</option><option value="test">Test</option><option value="known_crawler">Known crawler</option><option value="suspected_automation">Suspected automation</option><option value="unclassified">Unclassified</option></select></label><label class="report-field">Reason<input disabled={!interactive} class="control" name="note" maxlength="1000" required /></label><button class="action-primary self-end" disabled={!interactive} type="submit">Record</button></form>{#if form?.correctionError}<p role="alert" class="mt-2 text-sm text-red-300">{String(form.correctionError)}</p>{/if}{#if data.correctionLogAvailable && data.correctionLog.length}<p class="table-hint">Scroll sideways for every column. The first column stays visible.</p><div tabindex="-1" role="region" aria-label="Scrollable analytics table" class="table-wrap mt-5"><table><thead><tr><th>Event context</th><th>Version</th><th>Classification</th><th>Reason</th><th>Action</th></tr></thead><tbody>{#each data.correctionLog as correction}<tr><td>{correctionContext(correction)}</td><td class="numeric">{correction.classification_version}</td><td>{correction.classification.replaceAll('_', ' ')}</td><td>{correction.note}</td><td>{#if correction.canReverse}<form method="POST" action={actionHref('undoClassification')}><input disabled={!interactive} type="hidden" name="eventId" value={correction.engagement_event_id} /><button class="text-link" disabled={!interactive} type="submit">Reverse latest</button></form>{:else}<span class="text-charcoal-500">Earlier version</span>{/if}</td></tr>{/each}</tbody></table></div>{/if}</div>
			{/if}
			</section>
		{/if}
		{#if activeSection === 'analytics-preferences'}
			<section id="analytics-preferences" class="scroll-mt-20"><AnalyticsPreferences /></section>
		{/if}
		{/if}
</div>

{#if selectedPhoto}
	<dialog bind:this={photoDialog} class="photo-dialog" aria-labelledby="photo-dialog-title" oncancel={(event)=>{event.preventDefault();void closePhoto();}}>
			<button class="dialog-close" type="button" aria-label="Close photo inspection" onclick={() => void closePhoto()}><X class="size-5" /></button>
			{#if selectedPhoto.imageUrl}<img src={selectedPhoto.imageUrl} alt={`Inspection preview for photo ${selectedPhoto.photoId}`} />{/if}
			<div class="p-5"><p class="eyebrow">Photo inspection · {displayMeasure(report.query.measure)}</p><h2 id="photo-dialog-title" class="mt-1 text-xl text-charcoal-100">{data.albumCatalogue.find((album) => album.album_key === selectedPhoto?.albumKey)?.album_name ?? 'Gallery photo'}</h2><dl class="mt-4 grid grid-cols-2 gap-4 text-sm"><div><dt>Current</dt><dd>{countLabel(selectedPhoto.count)}</dd></div><div><dt>Previous</dt><dd>{selectedPhoto.previousCount??'Unavailable'}</dd></div><div><dt>Change</dt><dd>{selectedPhoto.difference === null ? 'Unavailable' : `${selectedPhoto.difference >= 0 ? '+' : ''}${selectedPhoto.difference}`}</dd></div><div><dt>Latest activity</dt><dd>{formatTime(selectedPhoto.lastActivity)}</dd></div><div><dt>Photo reference</dt><dd class="font-mono text-xs">{selectedPhoto.photoId}</dd></div></dl>{#if selectedPhoto.photoSegment}<a class="action-primary mt-5" href={`https://ninochavez.co${base}/photo/${encodeURIComponent(selectedPhoto.photoSegment)}`}>Open photo to share or download</a>{:else}<p class="mt-3 text-sm text-charcoal-400">A public photo address is unavailable.</p>{/if}<div class="mt-5 flex flex-wrap gap-2"><button class="action-secondary" type="button" onclick={() => toggleShortlist(selectedPhoto!.photoId)}>{shortlist.includes(selectedPhoto.photoId) ? 'Remove from shortlist' : 'Add to shortlist'}</button><button class="action-secondary" type="button" onclick={() => void closePhoto()}>Return to photos</button></div></div>
	</dialog>
{/if}

<style>
	/* Analytics is intentionally a light, data-first workspace. These local overrides do not alter the gallery theme. */
	.analytics-workspace { background: #edf2f7; color: #172033; margin-inline: auto; min-height: 100%; }
	.report-loading {position:fixed;right:1rem;top:1rem;z-index:60;margin:0;padding:.6rem 1rem;border:1px solid #aab7c8;border-radius:.5rem;background:#fff;color:#174ea6;box-shadow:0 2px 8px #17203322;}
	.workspace-masthead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 1rem; padding: .35rem 0 1.1rem; }
	.workspace-identity { display: inline-flex; align-items: center; gap: .6rem; min-width: 0; font-size: .82rem; font-weight: 700; color: #172033; }
	.workspace-mark { display: inline-grid; place-items: center; width: 2rem; height: 2rem; flex: none; border-radius: .45rem; background: #174ea6; color: #fff; font-size: .7rem; letter-spacing: .02em; }
	.workspace-divider { padding: 0 .2rem; color: #8c99aa; }
	.gallery-return { flex: none; border: 1px solid #aab7c8; border-radius: .45rem; padding: .55rem .7rem; color: #174ea6; font-size: .78rem; font-weight: 700; text-decoration: none; }
	.gallery-return:hover, .gallery-return:focus-visible { background: #dce9fa; outline-color: #174ea6; }
	.mobile-filter-bar { display: none; }
	:global(.analytics-workspace .text-charcoal-100), :global(.analytics-workspace .text-charcoal-200) { color: #172033 !important; }
	:global(.analytics-workspace .text-charcoal-300), :global(.analytics-workspace .text-charcoal-400), :global(.analytics-workspace .text-charcoal-500) { color: #526176 !important; }
	:global(.analytics-workspace .text-gold-400), :global(.analytics-workspace .text-gold-300) { color: #1769e0 !important; }
	.analytics-workspace header { border-color: #d8e0ea; }
	.analytics-workspace .analytics-nav { background: rgb(237 242 247 / .96); border-color: #d8e0ea; }
	.analytics-workspace .section-link, .analytics-workspace .section-link:hover, .analytics-workspace .section-link:focus-visible { color: #33445c; }
	.analytics-workspace .section-link:hover, .analytics-workspace .section-link:focus-visible { background: #dce9fa; }
	.analytics-workspace .album-workspace { display: grid; gap: 1rem; grid-template-columns: minmax(0, 1fr); }
	.analytics-workspace :global(.panel), .analytics-workspace .report-controls { background: #fff; border-color: #d8e0ea; color: #172033; }
	.analytics-workspace :global(.control) { background: #fff; border-color: #aab7c8; color: #172033; }
	.analytics-workspace :global(.control:focus) { border-color: #1769e0; box-shadow: 0 0 0 2px rgb(23 105 224 / .2); }
	.analytics-workspace :global(.action-primary) { background: #1769e0; color: #fff; }
	.analytics-workspace :global(.action-secondary), .analytics-workspace .icon-toggle { border-color: #aab7c8; color: #174ea6; }
	.analytics-workspace .eyebrow, .analytics-workspace .text-link { color: #174ea6; }
	.analytics-workspace .answer-grid { background: #d8e0ea; border-color: #d8e0ea; }
	.analytics-workspace .answer-grid > div { background: #fff; }
	.analytics-workspace .answer-grid strong, .analytics-workspace .answer-grid .answer-primary strong, .analytics-workspace .panel h2, .analytics-workspace .panel h3, .analytics-workspace .section-heading h2 { color: #172033; }
	.analytics-workspace .answer-grid .answer-primary strong { color: #174ea6; }
	.analytics-workspace .coverage-note { border-color: #1769e0; background: #e9f2ff; color: #243b5a; }
	.analytics-workspace .segmented { border-color: #d8e0ea; }
	.analytics-workspace .segmented :is(a,span) { color: #526176; }
	.analytics-workspace .segmented a[aria-current='page'] { border-color: #1769e0; color: #174ea6; }
	.analytics-workspace .segmented span[aria-disabled='true'] { color: #8c99aa; cursor: not-allowed; }
	.analytics-workspace .photo-card, .analytics-workspace .table-wrap { background: #fff; border-color: #d8e0ea; }
	.analytics-workspace .photo-inspect { background: #e8edf3; color: #526176; }
	.analytics-workspace .photo-count { background: rgb(23 32 51 / .9); color: #fff; }
	@media (min-width: 1024px) { .analytics-workspace .album-workspace { grid-template-columns: minmax(0, 1fr) 19rem; align-items: start; } }
	@media (max-width: 639px) {
		.analytics-workspace .analytics-nav { flex-wrap: nowrap; overflow-x: auto; scrollbar-width: thin; }
		.mobile-filter-bar { display: flex; align-items: center; justify-content: space-between; gap: .5rem; margin-top: .55rem; border: 1px solid #d8e0ea; border-radius: .7rem; background: #fff; padding: .4rem .45rem .4rem .75rem; font-size: .75rem; color: #526176; }
		.mobile-filter-bar span { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
		.mobile-filter-bar button { flex: none; border: 1px solid #aab7c8; border-radius: .45rem; padding: .45rem .65rem; color: #174ea6; font-weight: 700; }
		.analytics-workspace .report-controls:not(.mobile-open) { display: none; }
	}
 .freshness-line { display:flex;flex-wrap:wrap;gap:.5rem 1.5rem;margin-top:.75rem;font-size:.75rem;color:#aeb7c4; }
 .coverage-note { margin-top:.75rem;border:1px solid #e1ad36;padding:.5rem .75rem;color:#ddc995;font-size:.85rem; }

		.analytics-workspace :global(.control) { width: 100%; min-height: 2.75rem; border: 1px solid #49505c; border-radius: .55rem; background: #12151b; padding: .55rem .75rem; color: #f1f3f5; outline: none; }
		.analytics-workspace :global(.control:focus) { border-color: #d4a63f; box-shadow: 0 0 0 2px rgb(212 166 63 / .3); }
		.analytics-workspace :global(.action-primary), .analytics-workspace :global(.action-secondary), .analytics-workspace .icon-toggle { display: inline-flex; min-height: 2.75rem; align-items: center; justify-content: center; gap: .5rem; border-radius: .55rem; padding: .55rem .8rem; font-size: .875rem; font-weight: 650; }
		.analytics-workspace :global(.action-primary) { background: #e1ad36; color: #101216; }
		.analytics-workspace :global(.action-secondary), .analytics-workspace .icon-toggle { border: 1px solid #49505c; color: #e7eaef; }
		.analytics-workspace :global(.action-secondary:disabled) { opacity: .4; }
	.report-controls { border: 1px solid #49505c; border-radius: .85rem; background: rgb(37 41 50 / .82); padding: .9rem; }
	.control.pl-9 { padding-left:2.25rem; }
	.report-field { display: grid; gap: .3rem; min-width: 0; font-size: .78rem; color: #b7beca; }
	.eyebrow { font-size: .7rem; font-weight: 650; letter-spacing: .16em; text-transform: uppercase; color: #e3b444; }
	.section-link { min-height: 2.5rem; display: inline-flex; align-items: center; white-space: nowrap; border: 0; border-radius: .4rem; padding: 0 .7rem; background: transparent; color: #b7beca; cursor: pointer; font: inherit; font-size: .82rem; text-decoration: none; }
	.section-link:hover, .section-link:focus-visible { background: #252a33; color: #f1f3f5; }
	.analytics-workspace .section-link.section-active { background: #dce9fa; color: #174ea6; font-weight: 700; }
	.result-pager { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; margin-top: 1rem; color: #526176; font-size: .875rem; }
	.result-pager > div { display: flex; align-items: center; flex-wrap: wrap; gap: .75rem; }
	.album-picker { position: relative; }
	.album-picker > summary::-webkit-details-marker { display: none; }
	.album-menu { position: absolute; z-index: 40; top: calc(100% + .4rem); left: 0; width: min(32rem, calc(100vw - 2rem)); border: 1px solid #555d6a; border-radius: .7rem; background: #171a20; padding: .75rem; box-shadow: 0 18px 50px rgb(0 0 0 / .42); }
	.album-option { display: flex; width: 100%; min-height: 2.75rem; align-items: center; gap: .7rem; border-radius: .4rem; padding: .45rem .55rem; text-align: left; color: #d6dbe3; }
	.album-option:hover { background: #252a33; }
	.panel { min-width: 0; border: 1px solid #424a56; border-radius: .8rem; background: rgb(24 28 35 / .72); padding: 1rem; }
	.panel-heading, .section-heading { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: .75rem; }
	.panel h2, .panel h3, .section-heading h2 { margin-top: .2rem; font-size: 1.2rem; font-weight: 650; color: #f1f3f5; }
	.section-heading > p { font-size: .75rem; color: #8f98a7; }
	.answer-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: .75rem; overflow: hidden; border: 1px solid #424a56; border-radius: .8rem; background: #424a56; gap: 1px; }
	.answer-grid > div { min-width: 0; background: #14171c; padding: .9rem; }
	.answer-grid span { display: block; color: #9ea7b5; font-size: .72rem; }
	.answer-grid strong { display: block; margin-top: .2rem; color: #f1f3f5; font-size: 1.25rem; line-height: 1.2; font-variant-numeric: tabular-nums; }
	.answer-grid .answer-primary strong { color: #efc65d; font-size: 2rem; }
	.table-wrap { position:relative; max-width: 100%; overflow-x: auto; border: 1px solid #363d48; border-radius: .55rem; }
	table { width: 100%; min-width: 42rem; border-collapse: collapse; font-size: .82rem; text-align: left; }
	th { border-bottom: 1px solid #49505c; background: #171a20; padding: .55rem .7rem; color: #9ea7b5; font-size: .68rem; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; }
	td { border-bottom: 1px solid #303640; padding: .7rem; color: #e2e6ec; }
	.numeric { text-align: right; font-variant-numeric: tabular-nums; }
	tr.selected td { background: rgb(212 166 63 / .1); }
	.text-link { color: #ecc65f; font-size: .82rem; text-underline-offset: 4px; }
		.empty-copy { margin-top: 1rem; font-size: .86rem; color: #9ea7b5; }
		.journey-job { border: 1px solid #d8e0ea; border-radius: .55rem; padding: .8rem; }
		.journey-job summary { display: flex; cursor: pointer; align-items: center; justify-content: space-between; gap: 1rem; color: #172033; font-weight: 650; text-transform: capitalize; }
		.journey-unavailable { color: #8c5b00; font-size: .8rem; font-weight: 500; text-transform: none; }
	.error-panel { margin-top: 1.25rem; border: 1px solid rgb(248 113 113 / .55); border-radius: .8rem; background: rgb(69 10 10 / .35); padding: 1rem; color: #fecaca; }
	.error-panel h2 { font-size: 1.1rem; font-weight: 650; }
	.error-panel p { margin-top: .35rem; font-size: .85rem; }
	.segmented { display: flex; overflow-x: auto; border-bottom: 1px solid #3d444f; }
	.segmented :is(a,span) { display: inline-flex; min-height: 2.75rem; align-items: center; white-space: nowrap; border-bottom: 2px solid transparent; padding: .55rem .8rem; color: #9ea7b5; font-size: .82rem; text-decoration: none; }
	.segmented a[aria-current='page'] { border-color: #e1ad36; color: #f1f3f5; }
	.icon-toggle.active { border-color: #e1ad36; color: #efc65d; }
	.column-menu { position: absolute; right: 1rem; z-index: 10; display: grid; gap: .5rem; margin-top: .4rem; border: 1px solid #49505c; border-radius: .55rem; background: #171a20; padding: .75rem; box-shadow: 0 14px 35px rgb(0 0 0 / .35); }
	.photo-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .75rem; }
	.photo-card { overflow: hidden; border: 1px solid #39414c; border-radius: .65rem; background: #14171c; }
	.photo-card.selected { border-color: #e1ad36; box-shadow: 0 0 0 1px #e1ad36; }
	.photo-inspect { position: relative; display: grid; width: 100%; aspect-ratio: 4 / 3; place-items: center; overflow: hidden; background: #0d0f13; color: #7e8796; }
	.photo-inspect img { width: 100%; height: 100%; object-fit: cover; transition: transform .18s ease; }
	.photo-inspect:hover img { transform: scale(1.025); }
	.photo-count { position: absolute; right: .5rem; bottom: .5rem; border-radius: 99px; background: rgb(8 10 13 / .85); padding: .2rem .5rem; color: #f5d67e; font-size: .72rem; font-variant-numeric: tabular-nums; }
	.shortlist-check { display: flex; gap:.5rem; min-height: 2.75rem; align-items:center; font-size:.75rem; color:#cbd1da; }
 .photo-card-details {display:grid;gap:.25rem;}
 .table-hint {display:none;}
	.thumbnail-button { display: grid; min-width: 3.5rem; min-height: 2.75rem; place-items: center; color: #e1ad36; }
	.thumbnail-button img { width: 3.5rem; height: 2.75rem; border-radius: .3rem; object-fit: cover; }
	.source-list { margin-top: 1rem; }
	.source-list li { display: flex; justify-content: space-between; gap: 1rem; border-bottom: 1px solid #303640; padding: .65rem 0; color: #cbd1da; }
	.source-list strong { color: #f1f3f5; font-variant-numeric: tabular-nums; }
	.photo-dialog::backdrop { background:rgb(0 0 0 / .82); }
	.photo-dialog { margin:auto; padding:0; max-height:calc(100dvh - 2rem); position: fixed; inset:0; height:fit-content; width: min(42rem, calc(100% - 2rem)); overflow-y: auto; border: 1px solid #555d6a; border-radius: .85rem; background: #171a20; box-shadow: 0 24px 70px rgb(0 0 0 / .6); }
	.photo-dialog > img { width: 100%; max-height: 65vh; object-fit: contain; background: #0c0e11; }
	.dialog-close { position: absolute; right: .75rem; top: .75rem; z-index: 2; display: grid; width: 2.75rem; height: 2.75rem; place-items: center; border-radius: 99px; background: rgb(10 12 15 / .88); color: #fff; }
	.photo-dialog dt { color: #8f98a7; }
	.photo-dialog dd { margin-top: .2rem; color: #f1f3f5; font-variant-numeric: tabular-nums; }

	@media (min-width: 640px) {
		.answer-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
		.photo-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
	}
	@media (min-width: 1024px) { .photo-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
	@media (max-width: 639px) {
  .analytics-nav {justify-content:space-between;gap:0;}
  .section-link {padding:0 .2rem;font-size:.75rem;}
  .table-hint {display:block;color:#b7beca;font-size:.75rem;margin-top:.75rem;}
  .table-wrap th:first-child,.table-wrap td:first-child {position:sticky;left:0;z-index:1;background:#fff;min-width:8rem;max-width:10rem;overflow-wrap:anywhere;box-shadow:1px 0 #49505c;}
		.report-controls { padding: .75rem; }
		.panel { padding: .85rem; }
		.answer-grid strong { font-size: 1rem; }
		.answer-grid .answer-primary strong { font-size: 1.65rem; }
		.photo-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
	}
		@media (prefers-reduced-motion: reduce) { .photo-inspect img { transition: none; } }

		/* Final local surface: light slate, white, ink, and blue only. */
		.analytics-workspace { background: #edf2f7; color: #172033; }
		.analytics-workspace .report-controls, .analytics-workspace .panel { background: #fff; border-color: #d8e0ea; color: #172033; }
		.analytics-workspace .analytics-nav { background: rgb(237 242 247 / .96); border-color: #d8e0ea; }
		.analytics-workspace .section-link { color: #33445c; }
		.analytics-workspace .section-link:hover, .analytics-workspace .section-link:focus-visible { background: #dce9fa; color: #174ea6; }
		.analytics-workspace :global(.control), .analytics-workspace .album-menu, .analytics-workspace .column-menu { background: #fff; border-color: #aab7c8; color: #172033; }
		.analytics-workspace .album-option, .analytics-workspace .report-field { color: #33445c; }
		.analytics-workspace .album-option:hover { background: #e9f2ff; }
		.analytics-workspace :global(.action-primary) { background: #1769e0; color: #fff; }
		.analytics-workspace :global(.action-secondary), .analytics-workspace .icon-toggle { border-color: #aab7c8; color: #174ea6; }
		.analytics-workspace .eyebrow, .analytics-workspace .text-link { color: #174ea6; }
		.analytics-workspace .answer-grid { background: #d8e0ea; border-color: #d8e0ea; }
		.analytics-workspace .answer-grid > div { background: #fff; }
		.analytics-workspace .answer-grid strong, .analytics-workspace .answer-grid .answer-primary strong, .analytics-workspace .panel h2, .analytics-workspace .panel h3, .analytics-workspace .section-heading h2 { color: #172033; }
		.analytics-workspace .answer-grid .answer-primary strong { color: #174ea6; }
		.analytics-workspace .coverage-note { border-color: #1769e0; background: #e9f2ff; color: #243b5a; }
		.analytics-workspace .freshness-line, .analytics-workspace .empty-copy { color: #526176; }
		.analytics-workspace .overview-layout { display: grid; gap: 1rem; margin-top: .75rem; }
		.analytics-workspace .overview-trend { min-width: 0; }
		.analytics-workspace :global(.trend) { padding: .8rem; }
		.analytics-workspace :global(.trend svg) { height: 6rem; margin: .5rem 0; }
		.analytics-workspace .legacy-trend, .analytics-workspace .traffic-summary { display: none; }
		.analytics-workspace .table-wrap, .analytics-workspace .photo-card { background: #fff; border-color: #d8e0ea; }
		.analytics-workspace th { background: #f4f7fb; border-color: #d8e0ea; color: #526176; }
		.analytics-workspace td { border-color: #e8edf3; color: #172033; }
		.analytics-workspace tr.selected td { background: #e9f2ff; }
		.analytics-workspace .source-list li { border-color: #e8edf3; color: #33445c; }
		.analytics-workspace .source-list strong { color: #172033; }
		.analytics-workspace .photo-inspect { background: #e8edf3; color: #526176; }
		.photo-dialog { background: #fff; border-color: #aab7c8; color: #172033; }
		.photo-dialog > img { background: #edf2f7; }
		.photo-dialog dt, .photo-dialog dd, .photo-dialog h2 { color: #172033; }
		.photo-dialog .eyebrow { color: #174ea6; }
		.photo-dialog .action-primary, .photo-dialog .action-secondary { display:inline-flex; align-items:center; justify-content:center; min-height:2.75rem; padding:.6rem .9rem; border-radius:.55rem; font-size:.875rem; font-weight:650; }
		.photo-dialog .action-primary { background:#1769e0; color:#fff; }
		.photo-dialog .action-secondary { border:1px solid #aab7c8; color:#174ea6; }
		.photo-dialog :is(a,button):focus-visible { outline:3px solid #1769e0; outline-offset:3px; }
		.dialog-close { background: #172033; color: #fff; }
		@media (min-width: 1024px) { .analytics-workspace .overview-layout { grid-template-columns: minmax(0, 1.1fr) minmax(20rem, .9fr); align-items: start; } }
	@media (max-width: 639px) {
		.analytics-workspace > header .eyebrow { display: none; }
		.analytics-workspace > header h1 { margin-top: 0; }
		.analytics-workspace .report-controls > .grid { gap: .5rem; }
		.analytics-workspace .report-controls { padding: .6rem; }
	}
	.analytics-workspace .shortlist-check, .analytics-workspace .table-hint, .analytics-workspace .answer-grid span { color: #526176; }
	.analytics-workspace section[id] { scroll-margin-top: 6.5rem; }
	.analytics-workspace .album-picker-wrap { align-content: end; }
	.analytics-workspace .filter-label { font-size: .78rem; line-height: 1.2; color: #33445c; }
	.analytics-workspace .album-picker > summary { width: 100%; }
	.analytics-workspace .report-controls > details > summary { width: fit-content; }
	.analytics-workspace .report-controls > .grid { align-items: end; }
	.analytics-workspace .overview-next { display: grid; gap: 1rem; margin-top: 1rem; }
	.analytics-workspace .overview-ranking { padding: 1rem 1.1rem; }
	.analytics-workspace .overview-caption { color: #526176; font-size: .78rem; margin-top: .35rem; }
	.analytics-workspace .overview-albums { list-style: none; padding: 0; margin: .75rem 0 0; }
	.analytics-workspace .overview-albums li { display: grid; grid-template-columns: 1.5rem minmax(0,1fr) auto; align-items: center; gap: .75rem; border-top: 1px solid #e8edf3; padding: .68rem 0; }
	.analytics-workspace .rank-number { color: #667892; font-size: .78rem; font-variant-numeric: tabular-nums; }
	.analytics-workspace .overview-albums button { min-width: 0; background: none; border: 0; color: #172033; cursor: pointer; text-align: left; }
	.analytics-workspace .overview-albums button strong, .analytics-workspace .overview-photo-copy strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .84rem; }
	.analytics-workspace .overview-albums button span, .analytics-workspace .overview-photo-copy span { display: block; color: #526176; font-size: .72rem; }
	.analytics-workspace .rank-count { color: #174ea6; font-size: .85rem; font-variant-numeric: tabular-nums; }
	.analytics-workspace .overview-photos { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: .6rem; margin-top: .8rem; }
	.analytics-workspace .overview-photos a { display: flex; min-width: 0; align-items: center; gap: .6rem; border: 1px solid #e8edf3; border-radius: .55rem; background: #fff; padding: .4rem; color: #172033; text-align: left; text-decoration: none; cursor: pointer; }
	.analytics-workspace .overview-photos a:hover, .analytics-workspace .overview-photos a:focus-visible { border-color: #1769e0; background: #f4f8ff; }
	.analytics-workspace .overview-thumb { width: 3.6rem; height: 3.6rem; flex: none; overflow: hidden; border-radius: .35rem; background: #e8edf3; font-size: .65rem; color: #526176; }
	.analytics-workspace .overview-thumb img { width: 100%; height: 100%; object-fit: cover; }
	.analytics-workspace .overview-photo-copy { min-width: 0; }
	@media (min-width: 900px) { .analytics-workspace .overview-next { grid-template-columns: repeat(2,minmax(0,1fr)); } }
	@media (max-width: 639px) { .analytics-workspace .overview-photos { grid-template-columns: 1fr; } }
</style>
