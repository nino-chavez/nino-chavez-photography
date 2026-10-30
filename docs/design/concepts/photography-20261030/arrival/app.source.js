import { downloadZip } from 'client-zip';
import { galleries, recentGalleries, selectedWork } from './data.js';
import { createFittedPhotoLayout } from '../../../../../src/lib/gallery/photo-row-layout.ts';

const app = document.querySelector('#app');
const viewer = document.querySelector('#viewer');
const action = document.querySelector('#action');
const notice = document.querySelector('#notice');
const storageKey = 'photography-arrival-study-saved';
const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = () => new URLSearchParams(location.search);
const currentGallery = () => galleries.find(g => g.albumKey === params().get('gallery')) || galleries[0];
const model = () => ['beside', 'sequence'].includes(params().get('model')) ? params().get('model') : 'sheet';
const allPhotos = galleries.flatMap(g => g.photos.map(p => ({ ...p, gallery: g })));
const photoByKey = key => allPhotos.find(p => p.key === key);
let saved = [], persistent = true, activePhoto = null, viewerReturn = null, inlinePhoto = null;
let noticeTimer, downloading = false, abortDownload = null;
try { saved = JSON.parse(localStorage.getItem(storageKey) || '[]').filter(k => photoByKey(k)); }
catch { persistent = false; }

function url(values = {}, keep = false) {
  const p = keep ? params() : new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === null || value === '') p.delete(key); else p.set(key, value);
  }
  return `?${p}`;
}
function say(message) {
  clearTimeout(noticeTimer); notice.textContent = message; notice.classList.add('shown');
  noticeTimer = setTimeout(() => notice.classList.remove('shown'), 5000);
}
function image(p, eager = false) {
  return `<img src="${esc(p.src || p.cover)}" alt="${esc(p.alt)}" loading="${eager ? 'eager' : 'lazy'}" decoding="sync" style="aspect-ratio:${Number(p.ratio) || 2 / 3}">`;
}
const external = 'target="_blank" rel="noopener"';
function header() {
  const home = params().get('page') === 'home' && !params().get('q');
  return `<header class="site-header"><a class="brand" href="?page=home" data-nav><strong>Nino Chavez</strong><span>Photography</span></a><nav aria-label="Photography"><button class="info-link" data-info>About &amp; contact</button>${home ? '<a class="find-link" href="#find-event">Find your event</a>' : '<a class="find-link" href="?page=home" data-nav>Find your event</a>'}<a href="?page=saved" data-nav>Saved <span data-saved-total>${saved.length || ''}</span></a></nav></header>`;
}
function footer() {
  return `<footer><p>Photographs by Nino Chavez</p><nav aria-label="More"><a href="?page=work" data-nav>Selected photographs</a><a href="https://ninochavez.co/photography/coverage" ${external}>Request coverage ↗</a><a href="https://ninochavez.co" ${external}>Profile ↗</a><a href="https://ninochavez.co/blog" ${external}>Writing ↗</a></nav></footer>`;
}
function galleryTarget(g, entry = '') {
  const full = galleries.find(a => a.url === g.url);
  return full ? `href="${url({gallery:full.albumKey,from:'home',entry,q:params().get('q') || ''})}" data-nav` : `href="${esc(g.url)}" ${external}`;
}
function home() {
  const query = params().get('q') || '';
  const normalize = value => value.toLowerCase().replace(/october/g, 'oct').replace(/september/g, 'sep').replace(/august/g, 'aug').replace(/[^a-z0-9]+/g, ' ');
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  const list = recentGalleries.filter(g => terms.every(t => normalize(`${g.title} ${g.rawTitle} ${g.date}`).includes(t)));
  const search = `<form data-event-search class="event-search"><label for="event-query">Event, team or date</label><div><input id="event-query" name="q" type="search" value="${esc(query)}" placeholder="e.g. Chicago Point" autocomplete="off"><button type="submit" class="search-submit">Search</button></div></form>`;
  const hero = `<section class="home-hero" aria-label="Nino Chavez Photography"><picture class="hero-picture"><source media="(max-width:700px)" srcset="../assets/images/hero/flickday/fd-12-mobile.webp"><img src="../assets/images/hero/flickday/fd-12.webp" alt="Volleyball players celebrating together near the net" width="1920" height="1280" fetchpriority="high"></picture><div class="hero-shade"></div><div class="hero-bottom"><div class="hero-finder" id="find-event"><h1>Find your event.</h1>${search}<a class="browse-link" href="#recent-events">Browse recent events <span aria-hidden="true">↓</span></a></div><section class="hero-recent" aria-label="Latest galleries"><h2>Recent galleries</h2>${recentGalleries.slice(0,2).map(g=>`<a id="event-latest-${g.id}" ${galleryTarget(g,'latest')}><strong class="gallery-title">${esc(g.title)}</strong><span class="gallery-meta"><span>${esc(g.date)}</span><span class="gallery-cta">View gallery <span aria-hidden="true">→</span></span></span></a>`).join('')}</section></div></section>`;
  return `<main id="main" class="${query ? 'page home search-page' : 'home'}" tabindex="-1">${query ? `<section class="home-intro"><h1>Find your event</h1>${search}</section>` : hero}<section class="recent-events" id="recent-events" aria-labelledby="recent-title" tabindex="-1"><div class="section-title"><h2 id="recent-title">${query ? `Results for “${esc(query)}”` : 'Recent events'}</h2>${query ? '<a href="?page=home" data-nav>Clear search</a>' : `<a href="https://ninochavez.co/photography/albums" ${external}>All events ↗</a>`}</div>${list.length ? `<div class="event-list">${list.map((g, i) => `<a class="event-card" id="event-${g.id}" ${galleryTarget(g)}>${image({src:g.cover,alt:g.alt,ratio:1.5},i<2)}<div><p class="metadata">${esc(g.date)} <span>${esc(g.context)}</span></p><h3>${esc(g.title)}</h3><p class="event-count">${g.count} photos</p></div></a>`).join('')}</div>` : `<div class="empty"><h3>No matching galleries in this preview</h3><p>Try the event name, team or date. This study includes eight recent public galleries.</p><a class="button primary" href="https://ninochavez.co/photography/albums?q=${encodeURIComponent(query)}" ${external}>Search the full archive ↗</a><p>For a private gallery, use the link you received.</p></div>`}</section><div class="archive-end"><a class="button" href="https://ninochavez.co/photography/albums" ${external}>Browse the full archive ↗</a><p class="muted">Have a private gallery link? Open that link to view its photos.</p></div></main>`;
}
function saveButton(p) {
  const yes = saved.includes(p.key);
  return `<button class="save-button ${yes ? 'is-saved' : ''}" data-save="${esc(p.key)}" aria-pressed="${yes}" aria-label="${yes ? 'Remove saved' : 'Save'} ${esc(p.id)}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4z"/></svg><span>${yes ? 'Saved' : 'Save'}</span></button>`;
}
function tile(p, index = 0, compact = false, shares = null) {
  const style = shares ? `style="--share-2:${shares[2]};--share-3:${shares[3]};--share-4:${shares[4]}"` : '';
  return `<article class="photo-tile ${saved.includes(p.key) ? 'is-saved' : ''}" ${style}><button class="photo-open" id="photo-${esc(p.key)}" data-photo="${esc(p.key)}" aria-label="View ${esc(p.id)}">${image(p,index<8)}</button><div class="tile-label"><span>${esc(p.id)}</span>${compact ? '' : saveButton(p)}</div></article>`;
}
function fittedGrid(list) {
  const layout = createFittedPhotoLayout(list.map(p=>({...p,aspect_ratio:p.ratio})));
  return `<div class="photo-grid fitted-grid">${layout.map(({photo,index,shares})=>tile(photo,index,false,shares)).join('')}</div>`;
}
function scopedPhotos() {
  const g = currentGallery(), query = (params().get('find') || '').toLowerCase().trim();
  const terms = query.split(/\s+/).filter(Boolean);
  return allPhotos.filter(p => p.gallery.albumKey === g.albumKey && (params().get('saved') !== '1' || saved.includes(p.key)) && terms.every(t => `${p.id} ${p.caption} ${p.alt}`.toLowerCase().includes(t)));
}
function gallery() {
  const g = currentGallery(), list = scopedPhotos(), query = params().get('find') || '';
  const selected = g.photos.filter(p => saved.includes(p.key)).length;
  const isSaved = params().get('saved') === '1';
  const sourceLink = params().get('from') === 'home' ? `<a href="${url({page:'home',q:params().get('q')||''})}" data-nav data-return-event="${params().get('entry')==='latest'?'latest-':''}${g.id}">← Back to galleries</a>` : '';
  const active = list.find(p => p.key === inlinePhoto) || list[0];
  if(active) inlinePhoto = active.key;
  return `<main id="main" class="page gallery model-${model()}" tabindex="-1">${sourceLink ? `<div class="back-link">${sourceLink}</div>` : ''}<section class="gallery-intro"><div><p class="metadata">${esc(g.date)} · ${esc(g.context)}</p><h1>${esc(g.title)}</h1><p class="byline">${g.count} photos · By Nino Chavez</p></div><div class="gallery-actions"><button data-share-gallery>Share gallery</button><button data-download-gallery>Download all</button></div></section><div class="gallery-tools"><nav aria-label="Photos in this gallery"><a class="${!isSaved?'active':''}" href="${url({saved:null,find:null},true)}" data-nav ${!isSaved?'aria-current="page"':''}>All photos <span>${g.count}</span></a><a class="${isSaved?'active':''}" href="${url({saved:1,find:null},true)}" data-nav ${isSaved?'aria-current="page"':''}>Saved <span>${selected}</span></a></nav><details class="photo-finder" ${query?'open':''}><summary><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg>Search photos</summary><form data-photo-search><label for="photo-query">Photo number or description</label><div><input id="photo-query" name="find" type="search" placeholder="e.g. red jersey 11" value="${esc(query)}"><button>Find</button></div><small>Try a jersey number, color or photo number.</small></form></details></div>${query?`<div class="search-result" role="status">${list.length} photos matching “${esc(query)}” <a href="${url({find:null},true)}" data-nav>Clear search</a></div>`:''}${list.length ? model()==='sheet' ? fittedGrid(list) : `<div class="inspection-layout"><section class="inline-viewer" aria-label="Current photograph">${inspect(active,list,false)}</section><section class="contact-pane" aria-label="Gallery photographs">${model()==='sequence'?`<details><summary>See all ${list.length} photos</summary><div class="photo-grid mini">${list.map((p,i)=>tile(p,i,true)).join('')}</div></details>`:`<div class="photo-grid mini">${list.map((p,i)=>tile(p,i,true)).join('')}</div>`}</section></div>` : `<section class="empty"><h2>${isSaved?'No saved photos in this gallery':'No matching photos'}</h2><p>${isSaved?'Use Save on any photo to keep it here, then download your selection.':'Try a photo number, jersey color or a different description.'}</p><a class="button" href="${url({saved:null,find:null},true)}" data-nav>View all ${g.count} photos</a></section>`}<div class="gallery-end"><p>You’ve reached the end of ${query||isSaved?'this selection':'the gallery'}.</p><a href="#main">Back to top ↑</a></div><div id="selection-bar">${selectionBar()}</div></main>`;
}
function selectionBar() {
  if(params().get('page')) return '';
  const g = currentGallery(), count = saved.filter(k=>photoByKey(k)?.gallery.albumKey===g.albumKey).length;
  return count ? `<aside class="selection-bar" aria-label="Saved selection"><div><strong>${count} saved</strong><span>From this gallery · ${persistent?'on this browser':'until this page closes'}</span></div><button class="primary" data-download-saved="${g.albumKey}">Download saved (${count})</button></aside>` : '';
}
function savedPage() {
  const list = allPhotos.filter(p=>saved.includes(p.key));
  return `<main id="main" class="page saved-page" tabindex="-1"><div class="saved-intro"><div><p class="eyebrow">Your selection</p><h1>Saved photos</h1><p>${persistent?'Saved on this browser.':'Browser storage is unavailable. These saves last until this page closes.'} No account or sign-in.</p></div>${list.length?`<button class="primary" data-download-saved="all">Download saved (${list.length})</button>`:''}</div>${list.length?galleries.filter(g=>list.some(p=>p.gallery===g)).map(g=>`<section class="saved-gallery"><div class="section-title"><h2>${esc(g.title)}</h2><a href="${url({gallery:g.albumKey})}" data-nav>View gallery →</a></div>${fittedGrid(list.filter(p=>p.gallery===g))}</section>`).join(''):`<section class="empty"><h2>No saved photos yet</h2><p>Save photos while you browse. Return here to download them together.</p><a class="button primary" href="?page=home" data-nav>Find your gallery</a></section>`}</main>`;
}
function workPage() {
  return `<main id="main" class="page work-page" tabindex="-1"><div class="section-title"><div><p class="eyebrow">Nino Chavez</p><h1>Selected photographs</h1></div><a href="https://ninochavez.co/photography/coverage" ${external}>Request coverage ↗</a></div><div class="work-grid">${selectedWork.map((p,i)=>`<a href="${esc(p.url)}" ${external}>${image(p,i<3)}</a>`).join('')}</div><a href="?page=home" class="button" data-nav>Find your event photos</a></main>`;
}
function inspect(p, list, modal) {
  const index = list.findIndex(x=>x.key===p.key), fullIndex = p.gallery.photos.findIndex(x=>x.key===p.key);
  return `<div class="viewer-top"><div><span class="viewer-event">${esc(p.gallery.title)}</span><span class="viewer-context">${esc(p.gallery.date)} · Photo ${fullIndex+1} of ${p.gallery.count}</span></div>${modal?'<button data-close-viewer>Back to gallery</button>':''}</div><div class="photo-stage"><img src="${esc(p.large)}" alt="${esc(p.alt)}" decoding="sync"><button class="previous" data-step="-1" aria-label="Previous photo" ${index===0?'disabled':''}>←</button><button class="next" data-step="1" aria-label="Next photo" ${index===list.length-1?'disabled':''}>→</button></div><div class="viewer-bottom"><span class="photo-id">${esc(p.id)}</span><div class="viewer-actions">${saveButton(p)}<button data-share-photo="${esc(p.key)}">Share</button><button class="primary" data-download-photo="${esc(p.key)}">Download</button></div></div>`;
}
function viewerList(p) {
  // The event is the context, even when arriving through Saved or a search result.
  return allPhotos.filter(x=>x.gallery.albumKey===p.gallery.albumKey);
}
function openViewer(p, origin = null, updateUrl = true) {
  activePhoto=p; viewerReturn=origin || document.querySelector(`#photo-${CSS.escape(p.key)}`);
  viewer.innerHTML=inspect(p,viewerList(p),true);
  if(!viewer.open) viewer.showModal();
  if(updateUrl) history.replaceState(history.state,'',url({photo:p.id,gallery:p.gallery.albumKey},true));
  viewer.querySelector('[data-close-viewer]').focus();
}
function closeViewer() {
  viewer.close(); history.replaceState(history.state,'',url({photo:null},true));
  const target=viewerReturn?.isConnected?viewerReturn:document.querySelector(`#photo-${CSS.escape(activePhoto?.key||'')}`);
  target?.focus({preventScroll:true}); target?.scrollIntoView({block:'nearest'}); activePhoto=null;
}
function render(options = {}) {
  const p=params().get('page');
  document.body.classList.toggle('gallery-shell',!p);
  document.body.classList.toggle('home-shell',p==='home'&&!params().get('q'));
  app.innerHTML=header()+(p==='home'?home():p==='saved'?savedPage():p==='work'?workPage():gallery())+footer();
  document.title=p==='home'?'Find event photos — Nino Chavez':p==='saved'?'Saved photos — Nino Chavez':p==='work'?'Selected photographs — Nino Chavez':`${currentGallery().title} — Nino Chavez`;
  const deep=params().get('photo');
  if(deep){const photo=allPhotos.find(x=>x.gallery.albumKey===currentGallery().albumKey&&x.id===deep);if(photo)openViewer(photo,null,false);}
  if(options.focus&&!viewer.open) document.querySelector('#main').focus({preventScroll:true});
  for(const img of app.querySelectorAll('img')) img.addEventListener('error',()=>{img.classList.add('image-unavailable');img.closest('.photo-tile,.event-card')?.classList.add('image-failed');},{once:true});
}
function navigate(href, focusId = null) {
  history.replaceState({...history.state,scroll:scrollY,focus:document.activeElement?.id},'');
  if(viewer.open) viewer.close();
  document.querySelector('.study-bar details').open=false;
  history.pushState({},'',href); inlinePhoto=null; render({focus:true});
  if(focusId){const el=document.getElementById(focusId);el?.focus();el?.scrollIntoView({block:'center'});}else window.scrollTo(0,0);
}
function toggleSave(key) {
  const exists=saved.includes(key); saved=exists?saved.filter(k=>k!==key):[...saved,key];
  try{localStorage.setItem(storageKey,JSON.stringify(saved));}catch{persistent=false;}
  for(const b of document.querySelectorAll('[data-save]')) if(b.dataset.save===key){b.outerHTML=saveButton(photoByKey(key));}
  for(const tile of document.querySelectorAll('.photo-tile')){const key=tile.querySelector('[data-photo]')?.dataset.photo;tile.classList.toggle('is-saved',saved.includes(key));}
  document.querySelectorAll('[data-saved-total]').forEach(el=>el.textContent=saved.length||'');
  const count=saved.filter(k=>photoByKey(k)?.gallery.albumKey===currentGallery().albumKey).length;
  const tab=document.querySelector('.gallery-tools a[href*="saved=1"] span');if(tab)tab.textContent=count;
  const bar=document.querySelector('#selection-bar');if(bar)bar.innerHTML=selectionBar();
  if(params().get('page')==='saved'&&!viewer.open || params().get('saved')==='1'&&!viewer.open) render({focus:true});
  say(exists?'Removed from saved photos.':persistent?'Saved on this browser.':'Saved for now. Browser storage is unavailable; keep this page open.');
}
function showAction(content) {
  action.innerHTML=`<div class="action-heading"><h2>${content.title}</h2><button data-close-action aria-label="Close">×</button></div>${content.body}`;
  action.showModal();
}
function sharePhoto(p) {share(p.url,'Share this photo');}
function share(link,title) {
  showAction({title,body:`<p>Anyone with this public link can view the photo${title.includes('gallery')?'s in the gallery':''}.</p><label class="copy-label">Link<input id="copy-link" readonly value="${esc(link)}"></label><button class="primary wide" data-copy>Copy link</button>`});
}
function downloadOptions(photos,title) {
  const keys=photos.map(p=>p.key).join(',');
  showAction({title,body:`<p>${photos.length===1?'Choose a size.':`${photos.length} photos will be downloaded together as a ZIP file.`}</p><div class="download-options"><button data-download-keys="${keys}" data-size="large"><strong>For sharing</strong><span>1600px · ${photos.length===1?'JPEG':'ZIP'}</span><span aria-hidden="true">↓</span></button>${photos.length===1?`<button data-download-keys="${keys}" data-size="original"><strong>Full size</strong><span>Original resolution · JPEG</span><span aria-hidden="true">↓</span></button>`:''}</div><p class="rights">Photos are for personal use and recruiting purposes only.</p><div class="download-status" role="status" aria-live="polite"></div>`});
}
function fileDownload(blob,name) {
  const u=URL.createObjectURL(blob), a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),60000);
}
async function downloadPhotos(keys,size) {
  if(downloading)return; downloading=true;abortDownload=new AbortController();
  const list=keys.map(photoByKey).filter(Boolean), state=action.querySelector('.download-status');
  action.querySelectorAll('[data-download-keys]').forEach(b=>b.disabled=true);
  try{
    const files=[];
    for(const p of list){
      state.textContent=`Preparing ${files.length+1} of ${list.length}…`;
      const source=size==='original'?p.original:p.large;
      const response=await fetch(`https://ninochavez.co/photography/api/download?url=${encodeURIComponent(source)}&filename=${encodeURIComponent(`${p.id}.jpg`)}`,{signal:abortDownload.signal});
      if(!response.ok||!response.headers.get('content-type')?.includes('image/'))throw new Error('image_request_failed');
      files.push({name:`${p.gallery.albumKey}-${p.id}.jpg`,input:await response.blob()});
    }
    if(list.length===1)fileDownload(files[0].input,files[0].name);
    else fileDownload(await downloadZip(files).blob(),'nino-chavez-saved-photos.zip');
    state.textContent=`${list.length===1?'Photo':'ZIP'} ready. Check your browser’s downloads.`;
  }catch(e){state.textContent=e.name==='AbortError'?'Download preparation cancelled.':'Could not prepare the download. Your saved photos are still here. Try again.';}
  finally{downloading=false;abortDownload=null;action.querySelectorAll('[data-download-keys]').forEach(b=>b.disabled=false);}
}
document.addEventListener('click',async e=>{
  const b=e.target.closest('button,a');if(!b)return;
  if(b.matches('[data-nav]')){if(e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;e.preventDefault();navigate(b.getAttribute('href'),b.dataset.returnEvent?`event-${b.dataset.returnEvent}`:null);}
  else if(b.matches('[data-info]'))showAction({title:'Nino Chavez',body:`<p class="info-description">Volleyball and action-sports photography, from club tournaments to high school and college matches.</p><div class="info-actions"><a href="mailto:nino@ninochavez.co">nino@ninochavez.co ↗</a><a href="https://ninochavez.co/photography/coverage" ${external}>Request event coverage ↗</a><a href="https://www.instagram.com/nino.chavez.photo" ${external}>Instagram ↗</a><a href="https://ninochavez.co" ${external}>About Nino ↗</a></div>`});
  else if(b.matches('[data-photo]')){const p=photoByKey(b.dataset.photo);if(!p)return;if(!params().get('page')&&model()!=='sheet'){inlinePhoto=p.key;const panel=document.querySelector('.inline-viewer');panel.innerHTML=inspect(p,scopedPhotos(),false);panel.scrollIntoView({block:'nearest'});}else openViewer(p,b);}
  else if(b.matches('[data-save]')){const key=b.dataset.save;toggleSave(key);const next=[...document.querySelectorAll('[data-save]')].find(el=>el.dataset.save===key&&(viewer.open?viewer.contains(el):!viewer.contains(el)));next?.focus({preventScroll:true});}
  else if(b.matches('[data-close-viewer]'))closeViewer();
  else if(b.matches('[data-step]')){const p=viewer.open?activePhoto:photoByKey(inlinePhoto);if(!p)return;const list=viewer.open?viewerList(p):scopedPhotos(),idx=list.findIndex(x=>x.key===p.key),next=list[idx+Number(b.dataset.step)];if(!next)return;if(viewer.open){activePhoto=next;viewer.innerHTML=inspect(next,list,true);history.replaceState(history.state,'',url({photo:next.id},true));viewer.querySelector(`[data-step="${b.dataset.step}"]`)?.focus();}else{inlinePhoto=next.key;document.querySelector('.inline-viewer').innerHTML=inspect(next,list,false);}}
  else if(b.matches('[data-share-photo]'))sharePhoto(photoByKey(b.dataset.sharePhoto));
  else if(b.matches('[data-share-gallery]'))share(currentGallery().url,'Share this gallery');
  else if(b.matches('[data-copy]')){try{await navigator.clipboard.writeText(action.querySelector('#copy-link').value);b.textContent='Link copied';}catch{const input=action.querySelector('#copy-link');input.select();b.textContent='Select and copy the link above';}}
  else if(b.matches('[data-download-photo]'))downloadOptions([photoByKey(b.dataset.downloadPhoto)],'Download photo');
  else if(b.matches('[data-download-gallery]'))downloadOptions(allPhotos.filter(p=>p.gallery.albumKey===currentGallery().albumKey),'Download gallery');
  else if(b.matches('[data-download-saved]'))downloadOptions(allPhotos.filter(p=>saved.includes(p.key)&&(b.dataset.downloadSaved==='all'||p.gallery.albumKey===b.dataset.downloadSaved)),'Download saved photos');
  else if(b.matches('[data-download-keys]'))downloadPhotos(b.dataset.downloadKeys.split(','),b.dataset.size);
  else if(b.matches('[data-close-action]')){abortDownload?.abort();action.close();}
});
document.addEventListener('submit',e=>{
  if(e.target.matches('[data-event-search]')){e.preventDefault();navigate(url({page:'home',q:new FormData(e.target).get('q').trim()}));}
  if(e.target.matches('[data-photo-search]')){e.preventDefault();navigate(url({find:new FormData(e.target).get('find').trim()},true));}
});
viewer.addEventListener('cancel',e=>{e.preventDefault();closeViewer();});
action.addEventListener('cancel',()=>abortDownload?.abort());
document.addEventListener('keydown',e=>{if(viewer.open&&!action.open&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();viewer.querySelector(`[data-step="${e.key==='ArrowLeft'?-1:1}"]`)?.click();}});
window.addEventListener('popstate',()=>{if(viewer.open)viewer.close();render();window.scrollTo(0,history.state?.scroll||0);if(history.state?.focus)document.getElementById(history.state.focus)?.focus({preventScroll:true});});
render();
