import {events, work} from './data.js';

const app = document.querySelector('#app');
const viewer = document.querySelector('#viewer');
const names = {A:'Gallery wall', B:'Event desk', C:'Work + galleries'};
const storageKey = 'photography-rethink-20261030-saved';
let saved = [];
let noticeTimer;
let storageAvailable = true;
try { saved = JSON.parse(localStorage.getItem(storageKey) || '[]'); if (!Array.isArray(saved)) saved=[]; }
catch { storageAvailable=false; }
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params = () => new URLSearchParams(location.search);
const direction = () => names[params().get('c')] ? params().get('c') : 'A';
const page = () => params().get('page') || 'home';
const event = () => events.find(e => e.id===params().get('event')) || events[1];
const external = 'target="_blank" rel="noopener"';
const allPhotos = [...work, ...events.flatMap(e => e.photos.map(p => ({...p, event:e})))];
const photoByKey = key => allPhotos.find(p => p.key===key);

function url(changes={}, keep=false) {
  const p=keep ? params() : new URLSearchParams({c:direction()});
  for (const [key,value] of Object.entries(changes)) {
    if (value===null || value==='') p.delete(key); else p.set(key,value);
  }
  return `?${p}`;
}
function image(photo, eager=false) {
  return `<img src="${esc(photo.src||photo.cover)}" alt="${esc(photo.alt)}" loading="${eager?'eager':'lazy'}" decoding="sync"${photo.width ? ` width="${photo.width}" height="${photo.height}"` : ''}>`;
}
function header() {
  const active=page()==='events'||page()==='gallery'||(page()==='home'&&direction()==='B')?'events':page()==='saved'?'saved':'work';
  return `<header class="site-header"><a class="brand" href="${url({page:'home'})}" data-nav><strong>Nino Chavez</strong><span>Photography</span></a><nav class="site-nav" aria-label="Photography"><a href="${url({page:'work'})}" data-nav ${active==='work'?'aria-current="page"':''}>Photographs</a><a href="${url({page:'events'})}" data-nav ${active==='events'?'aria-current="page"':''}>Galleries</a><a href="${url({page:'saved'})}" data-nav ${active==='saved'?'aria-current="page"':''}>Saved<span class="saved-count">${saved.length?` (${saved.length})`:''}</span></a><a href="mailto:nino@ninochavez.co">Contact</a></nav></header>`;
}
function footer() {
  return `<footer class="footer"><p>Photographs by Nino Chavez</p><nav aria-label="More photography links"><a href="https://ninochavez.co/photography/explore" ${external}>Search all photos</a><a href="https://ninochavez.co/photography/timeline" ${external}>By date</a><a href="https://ninochavez.co/photography/collections" ${external}>Collections</a><a href="https://ninochavez.co" ${external}>Profile ↗</a><a href="https://ninochavez.co/blog" ${external}>Writing ↗</a></nav></footer><p class="preview-footer">Design preview: 8 recent public galleries, with 12-photo samples in the newest four. Saves are local to this preview.</p>`;
}
function finder(query='', placeholder='Event, team, or date') {
  return `<form class="find-form" data-find><label>Find a gallery<input name="q" type="search" value="${esc(query)}" placeholder="${placeholder}" autocomplete="off"></label><button class="primary" type="submit">Search</button></form>`;
}
function eventLink(e) {
  return e.photos.length ? `href="${url({page:'gallery',event:e.id,q:params().get('q')||'',month:params().get('month')||'',from:page()})}" data-nav` : `href="${esc(e.url)}" ${external}`;
}
function eventCard(e) {
  return `<a class="gallery-card" id="event-${e.id}" ${eventLink(e)}><img class="cover" src="${esc(e.cover)}" alt="${esc(e.alt)}" loading="lazy"><p class="meta">${esc(e.date)}</p><h3>${esc(e.title)}</h3>${e.context?`<p class="context">${esc(e.context)}</p>`:''}<p class="meta">${e.count} photos${e.photos.length?'':' · Opens live gallery ↗'}</p></a>`;
}
function eventRow(e) {
  return `<a class="event-row" id="event-${e.id}" ${eventLink(e)}><time class="date">${esc(e.date)}</time><img class="cover" src="${esc(e.cover)}" alt="${esc(e.alt)}" loading="lazy"><div class="event-title"><h3>${esc(e.title)}</h3>${e.context?`<p class="context muted">${esc(e.context)}</p>`:''}<p class="count">${e.count} photos${e.photos.length?'':' · Opens live gallery'}</p></div><span class="row-arrow" aria-hidden="true">${e.photos.length?'→':'↗'}</span></a>`;
}
function tile(p, label=false, eager=false) {
  return `<div class="photo-tile"><button class="photo-open" id="photo-${p.key}" data-photo="${p.key}" aria-label="Open ${esc(p.id||p.alt)}">${image(p,eager)}</button>${label?`<div class="photo-label"><span>${esc(p.id||'Selected photograph')}</span><button data-save="${p.key}" aria-pressed="${saved.includes(p.key)}">${saved.includes(p.key)?'Saved':'Save'}</button></div>`:''}</div>`;
}
function wall() { return `<div class="photo-wall">${work.map((p,i)=>tile(p,false,i<3)).join('')}</div>`; }
function recents(offset=0) {
  return `<section class="recent"><div class="section-heading"><h2>${offset?'More galleries':'Recent galleries'}</h2><a href="${url({page:'events'})}" data-nav>All galleries</a></div><div class="gallery-cards">${events.slice(offset,offset+4).map(eventCard).join('')}</div></section>`;
}
function archiveContent(rows=false) {
  const q=params().get('q')||'', month=params().get('month')||'';
  const terms=q.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  const list=events.filter(e=>terms.every(t=>`${e.title} ${e.rawTitle} ${e.date} ${e.context}`.toLocaleLowerCase().includes(t))&&(!month||e.date.startsWith(month)));
  return `<div class="filter-row">${finder(q)}<label>Month<select name="month" aria-label="Filter galleries by month"><option value="">All months</option>${['Oct','Sep','Aug'].map(m=>`<option value="${m}" ${month===m?'selected':''}>${{Oct:'October',Sep:'September',Aug:'August'}[m]} 2026</option>`).join('')}</select></label></div><p class="result-count" role="status">${list.length} ${list.length===1?'gallery':'galleries'}${q?` matching “${esc(q)}”`:''}${month?` in ${month}`:''}${q||month?` · <a href="${url({page:'events'})}" data-nav>Clear filters</a>`:' · Recent public galleries'}</p>${list.length?`<div class="${rows?'event-list':'gallery-cards'}">${list.map(rows?eventRow:eventCard).join('')}</div>`:`<section class="empty"><h2>No matching galleries</h2><p>Try an event name, team, or date. This preview searches eight recent galleries.</p><a class="button" href="${url({page:'events'})}" data-nav>Show recent galleries</a> <a class="button" href="https://ninochavez.co/photography/albums?q=${encodeURIComponent(q)}" ${external}>Search the full archive ↗</a></section>`}`;
}
function home() {
  if (direction()==='A') return `<main class="page" id="main" tabindex="-1"><div class="intro"><div><h1>Selected photographs</h1><p class="muted">Sports, people, and the moments between.</p></div>${finder()}</div>${wall()}${recents()}</main>`;
  if (direction()==='B') return `<main class="page event-desk" id="main" tabindex="-1"><aside class="desk-aside"><h2>Photographs<br>by Nino Chavez</h2><p>Sports, people, and the moments between.</p>${tile(work[1],false,true)}<a href="${url({page:'work'})}" data-nav>View selected photographs</a></aside><section class="desk-main"><div class="intro"><div><h1>Find your gallery</h1><p class="muted">Browse recent events or search by name and date.</p></div></div>${archiveContent(true)}</section></main>`;
  return `<main class="page" id="main" tabindex="-1"><div class="dual-home"><section class="dual-work"><div class="section-heading"><h2>Selected photographs</h2><a href="${url({page:'work'})}" data-nav>View all</a></div><div class="dual-pair">${tile(work[1],false,true)}${tile(work[2],false,true)}</div><p class="dual-caption">Sports, people, and the moments between.</p></section><section class="dual-find"><h1>Find your gallery</h1><p>Look up an event, team, or date.</p>${finder()}<div class="compact-list">${events.slice(0,3).map(e=>`<a class="compact-event" id="event-${e.id}" ${eventLink(e)}><img class="cover" src="${esc(e.cover)}" alt="${esc(e.alt)}"><div><h3>${esc(e.title)}</h3><p class="meta">${esc(e.date)} · ${e.count} photos</p></div></a>`).join('')}</div><a class="all-link" href="${url({page:'events'})}" data-nav>All galleries</a></section></div>${recents(3)}</main>`;
}
function gallery() {
  const e=event(), photoQuery=params().get('photoq')||'';
  const list=e.photos.filter(p=>`${p.id} ${p.alt}`.toLowerCase().includes(photoQuery.toLowerCase()));
  const backPage=params().get('from')||'events';
  const back=`<a class="back" href="${url({page:backPage,q:params().get('q')||'',month:params().get('month')||''})}" data-return="event-${e.id}">← ${params().get('q')||params().get('month')?'Back to results':backPage==='home'?'Back to home':'All galleries'}</a>`;
  const heading=`<div class="gallery-heading"><div><h1 tabindex="-1">${esc(e.title)}</h1><p class="meta">${e.context?`${esc(e.context)} · `:''}${esc(e.date)} · ${e.count} photos</p></div><div class="gallery-actions"><button data-share="${esc(e.url)}">Share gallery</button><a class="button" href="${esc(e.url)}" ${external}>Download on live site ↗</a></div></div>`;
  const content=`<div class="gallery-tools"><form class="gallery-search" data-photo-search><label>Search this gallery<input name="photoq" type="search" value="${esc(photoQuery)}" placeholder="Photo number or description"></label><button type="submit">Search</button></form><p>${list.length} photos in this preview<br><a href="${esc(e.url)}" ${external}>View all ${e.count} on the live site ↗</a></p></div>${list.length?`<div class="photo-grid">${list.map(p=>tile(p,true)).join('')}</div>`:`<section class="empty"><h2>No matching photos in this preview</h2><p>Try a photo number or clear the search to see the twelve sample photographs.</p><a class="button" href="${url({photoq:null},true)}" data-nav>Clear photo search</a></section>`}`;
  return `<main class="page" id="main" tabindex="-1">${back}${direction()==='B'?`<div class="gallery-layout"><aside>${heading}<p class="meta">Photographs by Nino Chavez</p></aside><section>${content}</section></div>`:heading+content}</main>`;
}
function savedPage() {
  const list=saved.map(photoByKey).filter(Boolean);
  return `<main class="page" id="main" tabindex="-1"><h1>Saved photographs</h1><p class="saved-info">Saved in this preview, on this browser.${storageAvailable?'':' Browser storage is unavailable; saves last only until this page closes.'}</p>${list.length?`<div class="photo-grid">${list.map(p=>tile(p,true)).join('')}</div>`:`<section class="empty"><h2>No saved photographs yet</h2><p>Open a photograph and choose Save to keep it here.</p><a class="button" href="${url({page:'events'})}" data-nav>Browse galleries</a></section>`}</main>`;
}
function recordLocation() {
  history.replaceState({...history.state,scroll:scrollY,focus:document.activeElement?.id},'',location.href);
}
function navigate(href, focusId) {
  recordLocation();
  history.pushState({scroll:0,focus:focusId},'',href);
  render(true);
}
function render(focus=false) {
  if(viewer.open) viewer.close();
  document.body.dataset.direction=direction();
  document.querySelector('#directions').innerHTML=Object.entries(names).map(([c,name])=>`<a href="${url({c},true)}" data-nav ${direction()===c?'aria-current="page"':''}>${c} · ${name}</a>`).join('');
  let body;
  switch(page()) {
    case 'events': body=`<main class="page" id="main" tabindex="-1"><div class="intro"><div><h1>Event galleries</h1><p class="muted">Find your event. Open the gallery. Keep your photographs.</p></div></div>${archiveContent(direction()==='B')}</main>`;break;
    case 'gallery': body=gallery();break;
    case 'work': body=`<main class="page" id="main" tabindex="-1"><div class="intro"><h1>Selected photographs</h1><a href="${url({page:'events'})}" data-nav>Looking for an event? Find your gallery</a></div>${wall()}</main>`;break;
    case 'saved': body=savedPage();break;
    default:body=home();
  }
  app.innerHTML=header()+body+footer();
  document.title=`${page()==='gallery'?event().title:page()==='saved'?'Saved photographs':'Nino Chavez Photography'} — ${names[direction()]} preview`;
  if(params().get('photo')) showViewer(params().get('photo'));
  else requestAnimationFrame(()=>{
    window.scrollTo(0,history.state?.scroll||0);
    const target=document.getElementById(history.state?.focus);
    if(target){target.focus({preventScroll:true});if(focus)target.scrollIntoView({block:'center'});}
    else if(focus)document.querySelector('#main')?.focus({preventScroll:true});
  });
}
function photoSet() {
  if(page()==='gallery') return event().photos.filter(p=>`${p.id} ${p.alt}`.toLowerCase().includes((params().get('photoq')||'').toLowerCase()));
  if(page()==='saved')return saved.map(photoByKey).filter(Boolean);
  return work;
}
function showViewer(key) {
  const p=photoByKey(key);if(!p)return;
  const list=photoSet(), index=list.findIndex(x=>x.key===key), source=p.url||p.src;
  viewer.innerHTML=`<div class="viewer-shell"><div class="viewer-top"><div class="viewer-title"><h2>${esc(p.event?.title||'Selected photographs')}</h2><p>${esc(p.id||'Nino Chavez Photography')} <span class="viewer-context">${p.event?`· ${esc(p.event.date)}`:''}</span> · ${index+1} of ${list.length}</p></div><div class="viewer-actions"><button class="share-photo" data-share="${esc(source)}">Share</button><button data-close autofocus>Close</button></div></div><div class="viewer-stage"><button data-step="-1" aria-label="Previous photograph" ${index<=0?'disabled':''}>←</button><img src="${esc(p.large||p.src)}" alt="${esc(p.alt)}"><button data-step="1" aria-label="Next photograph" ${index>=list.length-1?'disabled':''}>→</button></div><div class="viewer-bottom"><a class="photo-source" href="${esc(source)}" ${external}>${p.event?'Download on live site ↗':'Open original image ↗'}</a><button class="saved-toggle" data-save="${p.key}" aria-pressed="${saved.includes(p.key)}">${saved.includes(p.key)?'Saved · Remove':'Save photograph'}</button></div></div>`;
  if(!viewer.open)viewer.showModal();
}
function openPhoto(key) {
  recordLocation();
  history.pushState({...history.state,modal:true,focus:`photo-${key}`},'',url({photo:key},true));
  showViewer(key);
}
function closeViewer() {
  if(history.state?.modal)history.back();
  else {history.replaceState({...history.state,focus:`photo-${params().get('photo')}`},'',url({photo:null},true));render(true);}
}
function stepPhoto(delta) {
  const list=photoSet(),i=list.findIndex(p=>p.key===params().get('photo')),p=list[i+delta];
  if(!p)return;
  const focused=document.activeElement?.getAttribute('data-step');
  history.replaceState(history.state,'',url({photo:p.key},true));showViewer(p.key);
  if(focused)viewer.querySelector(`[data-step="${focused}"]:not(:disabled)`)?.focus();
}
function notify(message) {
  clearTimeout(noticeTimer);document.querySelector('#notice').textContent=message;
  noticeTimer=setTimeout(()=>document.querySelector('#notice').textContent='',3500);
}
function savePhoto(key) {
  const wasSaved=saved.includes(key);
  saved=wasSaved?saved.filter(k=>k!==key):[...saved,key];
  try {localStorage.setItem(storageKey,JSON.stringify(saved));}catch{storageAvailable=false;}
  document.querySelectorAll('[data-save]').forEach(b=>{if(b.dataset.save===key){b.setAttribute('aria-pressed',String(!wasSaved));b.textContent=b.classList.contains('saved-toggle')?(!wasSaved?'Saved · Remove':'Save photograph'):(!wasSaved?'Saved':'Save');}});
  document.querySelectorAll('.saved-count').forEach(n=>n.textContent=saved.length?` (${saved.length})`:'');
  if(page()==='saved'&&!viewer.open)render();
  notify(`${wasSaved?'Removed from':'Added to'} saved photographs${storageAvailable?'':' for this visit'}.`);
}
async function share(source) {
  try{await navigator.clipboard.writeText(source);notify('Public link copied.');}
  catch{const host=viewer.open?viewer.querySelector('.viewer-bottom'):document.querySelector('#main');let p=host.querySelector('.clipboard-fallback');if(!p){p=document.createElement('p');p.className='clipboard-fallback';host.append(p);}p.textContent=`Copy this public link: ${source}`;}
}
document.addEventListener('click',e=>{
  const a=e.target.closest('a[data-nav],a[data-return]');
  if(a&&!e.metaKey&&!e.ctrlKey&&!e.shiftKey&&!e.altKey&&e.button===0){e.preventDefault();navigate(a.href,a.dataset.return);return;}
  const b=e.target.closest('button');if(!b)return;
  if(b.dataset.photo)openPhoto(b.dataset.photo);
  else if(b.dataset.save)savePhoto(b.dataset.save);
  else if(b.hasAttribute('data-close'))closeViewer();
  else if(b.dataset.step)stepPhoto(Number(b.dataset.step));
  else if(b.dataset.share)share(b.dataset.share);
});
document.addEventListener('submit',e=>{
  const form=e.target;
  if(form.matches('[data-find]')){e.preventDefault();navigate(url({page:'events',q:new FormData(form).get('q')?.trim()||'',month:params().get('month')||''}));}
  if(form.matches('[data-photo-search]')){e.preventDefault();navigate(url({photoq:new FormData(form).get('photoq')?.trim()||''},true));}
});
document.addEventListener('change',e=>{if(e.target.matches('select[name="month"]'))navigate(url({page:'events',q:params().get('q')||'',month:e.target.value}));});
document.addEventListener('error',e=>{if(e.target.tagName==='IMG'){e.target.classList.add('image-failed');e.target.alt=`Image unavailable. ${e.target.alt}`;}},true);
viewer.addEventListener('cancel',e=>{e.preventDefault();closeViewer();});
viewer.addEventListener('keydown',e=>{if(e.key==='ArrowRight'){e.preventDefault();stepPhoto(1);}if(e.key==='ArrowLeft'){e.preventDefault();stepPhoto(-1);}});
window.addEventListener('popstate',()=>render(true));
render();
