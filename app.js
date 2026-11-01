'use strict';
const $ = id => document.getElementById(id);
const video = $('video'), viewer = $('viewer');
let videos = [], filtered = [], rendered = 0, current = -1, lastFocus, toastTimer;
let shareContext = null, shareBusy = false;
const batch = 24;
const windowMargin = 1000;
let galleryGroups = [], resizeTimer, cleanupFrame;
const groupByElement = new WeakMap();
const groupObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  entries.forEach(entry => {
    const group = groupByElement.get(entry.target);
    if (!group || !entry.target.isConnected) return;
    if (entry.isIntersecting) mountGroup(group); else unmountGroup(group);
  });
}, { rootMargin: `${windowMargin}px 0px` }) : null;
const scrollObserver = 'IntersectionObserver' in window ? new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting) && !viewer.open && rendered < filtered.length) renderMore();
}, { rootMargin: '500px 0px' }) : null;
scrollObserver?.observe($('scroll-sentinel'));
const pathURL = path => new URL(path.split('/').map(encodeURIComponent).join('/'), document.baseURI).href;
const thumbnailURL = path => `${pathURL(path)}?v=webp-320-1`;
const formatTime = value => Number.isFinite(value) ? `${Math.floor(value / 60)}:${String(Math.floor(value % 60)).padStart(2, '0')}` : '0:00';
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500); }
function attachThumbnail(thumb, item) {
  const status = document.createElement('div'); status.className = 'thumb-status'; status.setAttribute('aria-hidden', 'true');
  const spinner = document.createElement('span'); spinner.className = 'thumb-spinner';
  const label = document.createElement('span'); label.textContent = 'Carregando…';
  status.append(spinner, label); thumb.append(status);
  const unavailable = () => {
    thumb.classList.remove('is-loading'); thumb.classList.add('is-error'); thumb.setAttribute('aria-busy', 'false');
    spinner.remove(); label.textContent = 'Prévia indisponível';
  };
  if (!item.thumbnail) { unavailable(); return; }
  thumb.classList.add('is-loading'); thumb.setAttribute('aria-busy', 'true');
  const img = new Image(); img.alt = ''; img.loading = 'lazy'; img.decoding = 'async'; img.width = 360; img.height = 640;
  img.onload = async () => {
    try { await img.decode(); } catch { /* The loaded image can still be displayed. */ }
    thumb.classList.remove('is-loading'); thumb.setAttribute('aria-busy', 'false'); status.remove();
  };
  img.onerror = () => { img.remove(); unavailable(); };
  thumb.append(img); img.src = thumbnailURL(item.thumbnail);
}
function createCards(items, includeImages = true) {
  const fragment = document.createDocumentFragment();
  items.forEach(item => {
    const button = document.createElement('button'); button.className = 'card'; button.setAttribute('aria-label', `Assistir ${item.title.toLowerCase()}`);
    button.dataset.videoId = item.id;
    const thumb = document.createElement('div'); thumb.className = 'thumb';
    if (includeImages) attachThumbnail(thumb, item);
    const play = document.createElement('span'); play.className = 'card-play'; play.textContent = '▶'; play.setAttribute('aria-hidden', 'true');
    const number = document.createElement('span'); number.className = 'card-number'; number.textContent = item.title.replace('Recordação ', 'Nº '); number.setAttribute('aria-hidden', 'true');
    thumb.append(play, number);
    const title = document.createElement('div'); title.className = 'card-title'; title.textContent = item.title;
    const arrow = document.createElement('span'); arrow.textContent = '↗'; arrow.setAttribute('aria-hidden', 'true'); title.append(arrow);
    button.append(thumb, title); button.addEventListener('click', () => openVideo(videos.indexOf(item))); fragment.append(button);
  });
  return fragment;
}
function mountGroup(group, measureOnly = false) {
  if (group.mounted) return;
  group.element.classList.remove('is-placeholder');
  group.element.style.height = '';
  group.element.replaceChildren(createCards(group.items, !measureOnly));
  group.mounted = true;
}
function unmountGroup(group) {
  if (!group.mounted || !groupObserver) return;
  // Keep the focused card and the player opener alive for keyboard/focus return.
  if (group.element.contains(document.activeElement) || (viewer.open && lastFocus && group.element.contains(lastFocus))) return;
  const height = group.element.getBoundingClientRect().height;
  const restore = document.createElement('button');
  restore.className = 'secondary restore-group';
  restore.textContent = `Mostrar ${group.items[0].title} até ${group.items.at(-1).title}`;
  const restoreFocus = () => {
    mountGroup(group);
    const card = group.element.querySelector('.card');
    card?.focus({ preventScroll: true });
    card?.scrollIntoView({ block: 'center', behavior: 'instant' });
  };
  restore.addEventListener('focus', restoreFocus);
  restore.addEventListener('click', restoreFocus);
  group.element.style.height = `${height}px`;
  group.element.classList.add('is-placeholder');
  // No references to detached cards/images are kept; the browser may free them.
  group.element.replaceChildren(restore);
  group.mounted = false;
}
function updateGalleryWindow() {
  if (!groupObserver) return;
  galleryGroups.forEach(group => {
    const bounds = group.element.getBoundingClientRect();
    if (bounds.bottom >= -windowMargin && bounds.top <= innerHeight + windowMargin) mountGroup(group);
    else unmountGroup(group);
  });
}
function scheduleGalleryCleanup() {
  if (cleanupFrame) return;
  cleanupFrame = requestAnimationFrame(() => { cleanupFrame = null; updateGalleryWindow(); });
}
function refreshGroupSizes() {
  if (!groupObserver) return;
  const anchor = [...$('gallery').querySelectorAll('.card')].find(card => {
    const bounds = card.getBoundingClientRect(); return bounds.bottom > 0 && bounds.top < innerHeight;
  });
  const anchorTop = anchor?.getBoundingClientRect().top;
  // Re-measure placeholders at the new column width instead of retaining stale heights.
  galleryGroups.forEach(group => {
    const wasMounted = group.mounted;
    mountGroup(group, !wasMounted);
    if (!wasMounted) unmountGroup(group);
  });
  if (anchor?.isConnected) window.scrollBy({ top: anchor.getBoundingClientRect().top - anchorTop, behavior: 'instant' });
  updateGalleryWindow();
}
if ('ResizeObserver' in window) {
  let galleryWidth = $('gallery').getBoundingClientRect().width;
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (width === galleryWidth) return;
    galleryWidth = width; clearTimeout(resizeTimer); resizeTimer = setTimeout(refreshGroupSizes, 120);
  }).observe($('gallery'));
} else window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(refreshGroupSizes, 120); });
document.addEventListener('focusin', scheduleGalleryCleanup);
function renderMore() {
  const items = filtered.slice(rendered, rendered + batch);
  if (!items.length) return;
  const element = document.createElement('div'); element.className = 'gallery-group';
  element.setAttribute('role', 'group');
  element.setAttribute('aria-label', `${items[0].title} até ${items.at(-1).title}`);
  const group = { element, items, mounted: false };
  galleryGroups.push(group); groupByElement.set(element, group);
  $('gallery').append(element); mountGroup(group); groupObserver?.observe(element);
  rendered = Math.min(rendered + batch, filtered.length);
  const recordLabel = filtered.length === 1 ? 'recordação' : 'recordações';
  $('shown').textContent = filtered.length ? `${rendered} de ${filtered.length} ${recordLabel}` : '';
  $('load-more').hidden = rendered >= filtered.length;
  $('scroll-hint').hidden = !scrollObserver || rendered >= filtered.length;
  if (rendered && rendered === filtered.length) $('shown').textContent = `${rendered} de ${filtered.length} ${recordLabel} — você chegou ao fim.`;
  return group;
}
function filterGallery() {
  const query = $('search').value.trim().toLocaleLowerCase('pt-BR');
  filtered = videos.filter(item => item.title.toLocaleLowerCase('pt-BR').includes(query)); rendered = 0;
  groupObserver?.disconnect(); galleryGroups = []; $('gallery').replaceChildren();
  $('load-state').textContent = filtered.length ? '' : 'Nenhuma recordação encontrada. Tente outro número.'; renderMore();
}
async function loadCatalog() {
  $('retry').hidden = true; $('load-state').textContent = 'Preparando suas recordações…';
  try {
    const response = await fetch('videos.json', { cache: 'no-cache' }); if (!response.ok) throw new Error('Catálogo indisponível');
    videos = await response.json(); $('count').textContent = `${videos.length} recordações`;
    $('surprise').disabled = !videos.length; filterGallery();
    const covers = videos.filter(item => item.thumbnail);
    if (covers.length) { $('hero-front').src = thumbnailURL(covers[Math.min(2, covers.length - 1)].thumbnail); $('hero-back').src = thumbnailURL(covers[Math.min(4, covers.length - 1)].thumbnail); }
    openFromURL();
  } catch (error) { $('load-state').textContent = 'Não foi possível carregar o álbum. Verifique sua conexão e tente novamente.'; $('count').textContent = 'Álbum indisponível'; $('retry').hidden = false; }
}
function updateURL(id) { const url = new URL(location.href); if (id) url.searchParams.set('video', id); else url.searchParams.delete('video'); history.replaceState(null, '', url); }
function openVideo(index, changeURL = true) {
  if (index < 0 || index >= videos.length) return;
  if (!viewer.open) { lastFocus = document.activeElement; viewer.showModal(); }
  current = index; const item = videos[index]; video.pause(); video.src = pathURL(item.file); video.poster = item.thumbnail ? thumbnailURL(item.thumbnail) : ''; video.load();
  viewer.setAttribute('aria-label', `Player — ${item.title}`);
  $('seek').value = 0; $('seek').disabled = true; $('time').textContent = '0:00 / 0:00'; $('player-message').textContent = ''; $('big-play').hidden = false;
  $('share-fallback').hidden = true; shareContext = null; $('download').href = pathURL(item.file); $('download').download = item.file.split('/').pop();
  $('previous').disabled = index === 0; $('next').disabled = index === videos.length - 1;
  video.classList.remove('portrait'); $('stage').classList.remove('swapping'); void $('stage').offsetWidth; $('stage').classList.add('swapping');
  if (changeURL) updateURL(item.id);
}
function closeViewer(changeURL = true) {
  video.pause(); video.removeAttribute('src'); video.load();
  if (viewer.open) viewer.close();
  if (changeURL) updateURL(null);
  const opener = lastFocus; lastFocus = null;
  if (opener?.isConnected) opener.focus({ preventScroll: true });
  scheduleGalleryCleanup();
}
function openFromURL() { const id = new URL(location.href).searchParams.get('video'); if (!id) { if (viewer.open) closeViewer(false); return; } const index = videos.findIndex(item => item.id === id); if (index >= 0) openVideo(index, false); else toast('Esta recordação não foi encontrada no álbum.'); }
async function togglePlay() { if (!video.paused) { video.pause(); return; } try { await video.play(); } catch { $('player-message').textContent = 'Não foi possível reproduzir. Tente novamente ou baixe o vídeo.'; } }
function syncPlay() { const paused = video.paused; $('play').textContent = paused ? '▶ Reproduzir' : 'Ⅱ Pausar'; $('play').setAttribute('aria-label', paused ? 'Reproduzir' : 'Pausar'); $('big-play').hidden = !paused; }
function trackVideoEvent(name, item, parameters = {}) {
  if (!item || typeof window.gtag !== 'function') return;
  try {
    window.gtag('event', name, {
      send_to: 'G-K27Z7H0JVY', content_type: 'video', item_id: item.id,
      video_title: item.title, ...parameters
    });
  } catch { /* Analytics must never interrupt sharing. */ }
}
function recordShare(context, method) {
  if (!context || context.recorded) return;
  context.recorded = true;
  trackVideoEvent('share', context.item, { method });
}
async function copyShare() {
  const context = shareContext; if (!context) return;
  try {
    await navigator.clipboard.writeText(context.url);
    recordShare(context, 'copy_link');
    if (shareContext === context) $('share-fallback').hidden = true;
    toast('Link copiado!');
  } catch {
    if (shareContext !== context) return;
    $('share-fallback').hidden = false; $('share-url').focus(); $('share-url').select();
    toast('Selecione e copie o link da recordação.');
  }
}
async function shareCurrent() {
  const item = videos[current]; if (!item || shareBusy) return;
  shareBusy = true; $('share').disabled = true;
  const url = new URL(location.href); url.searchParams.set('video', item.id); url.hash = '';
  const context = { item, url: url.href, recorded: false }; shareContext = context;
  $('share-url').value = context.url;
  trackVideoEvent('video_share_click', item);
  try {
    if (navigator.share) {
      try {
        await navigator.share({ title: `${item.title} — Edna Moreira`, text: 'Uma recordação para compartilhar com carinho.', url: context.url });
        recordShare(context, 'native_share'); return;
      } catch (error) { if (error.name === 'AbortError') return; }
    }
    await copyShare();
  } finally { shareBusy = false; $('share').disabled = false; }
}
$('share-url').addEventListener('copy', event => {
  const context = shareContext;
  if ($('share-url').selectionEnd <= $('share-url').selectionStart) return;
  setTimeout(() => { if (!event.defaultPrevented) recordShare(context, 'manual_copy'); }, 0);
});
$('load-more').addEventListener('click', () => { const group = renderMore(); group?.element.querySelector('.card')?.focus({ preventScroll: true }); });
$('search').addEventListener('input', filterGallery); $('retry').addEventListener('click', loadCatalog);
$('surprise').addEventListener('click', () => openVideo(Math.floor(Math.random() * videos.length)));
$('close').addEventListener('click', () => closeViewer()); viewer.addEventListener('cancel', event => { event.preventDefault(); closeViewer(); });
viewer.addEventListener('click', event => { if (event.target === viewer) { const bounds = viewer.getBoundingClientRect(); if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeViewer(); } });
$('play').addEventListener('click', togglePlay); $('big-play').addEventListener('click', togglePlay); video.addEventListener('click', togglePlay);
video.controls = false;
video.addEventListener('play', () => { $('player-message').textContent = ''; syncPlay(); }); video.addEventListener('pause', syncPlay); video.addEventListener('ended', syncPlay);
video.addEventListener('loadedmetadata', () => { video.classList.toggle('portrait', video.videoHeight > video.videoWidth); $('time').textContent = `0:00 / ${formatTime(video.duration)}`; $('seek').disabled = !Number.isFinite(video.duration) || video.duration <= 0; });
video.addEventListener('timeupdate', () => { $('time').textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`; $('seek').value = video.duration ? video.currentTime / video.duration * 1000 : 0; });
video.addEventListener('waiting', () => { $('player-message').textContent = 'Carregando vídeo…'; }); video.addEventListener('playing', () => { $('player-message').textContent = ''; });
video.addEventListener('error', () => { if (video.getAttribute('src')) $('player-message').textContent = 'Não foi possível carregar este vídeo. Tente baixar ou escolha outra recordação.'; });
$('seek').addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number($('seek').value) / 1000 * video.duration; });
$('mute').addEventListener('click', () => { video.muted = !video.muted; $('mute').textContent = video.muted ? '×♪ Sem som' : '♪ Som ligado'; $('mute').setAttribute('aria-label', video.muted ? 'Ativar som' : 'Silenciar'); $('mute').setAttribute('aria-pressed', String(video.muted)); });
$('fullscreen').addEventListener('click', async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else if (video.requestFullscreen) await video.requestFullscreen(); else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); else toast('Use a opção de tela cheia do seu navegador.'); } catch { toast('Tela cheia indisponível neste navegador.'); } });
$('previous').addEventListener('click', () => openVideo(current - 1)); $('next').addEventListener('click', () => openVideo(current + 1)); $('share').addEventListener('click', shareCurrent); $('copy').addEventListener('click', copyShare);
viewer.addEventListener('keydown', event => { if (event.target.matches('input')) return; if (event.key === 'ArrowRight') { event.preventDefault(); openVideo(current + 1); } if (event.key === 'ArrowLeft') { event.preventDefault(); openVideo(current - 1); } if (event.key === ' ' && !event.target.matches('button,a')) { event.preventDefault(); togglePlay(); } });
let touchStart;
$('stage').addEventListener('touchstart', event => { if (event.touches.length === 1) touchStart = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }, { passive: true });
$('stage').addEventListener('touchend', event => { if (!touchStart) return; const deltaX = event.changedTouches[0].clientX - touchStart.x; const deltaY = event.changedTouches[0].clientY - touchStart.y; if (Math.abs(deltaX) > 60 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) openVideo(current + (deltaX < 0 ? 1 : -1)); touchStart = null; }, { passive: true });
$('stage').addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
window.addEventListener('popstate', openFromURL); loadCatalog();
