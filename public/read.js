import { normalizeScrollItem, safeMediaUrl } from './scroll-feed-core.js';
import { videoEmbedUrl } from './post-cards.js';
import { appendPoemLinks } from './poem-links.js';
const $ = id => document.getElementById(id);
const id = new URLSearchParams(location.search).get('item');
async function load() {
  $('retry').hidden = true;
  $('status').textContent = 'Loading…';
  try {
    if (!id) throw new Error('This reading link is incomplete.');
    const response = await fetch('/api/poemContent?' + new URLSearchParams({id}));
    if (!response.ok) throw new Error(response.status === 404 ? 'This item is not available to read.' : 'Could not load this item. Please retry.');
    const data = await response.json();
    const item = normalizeScrollItem(data.item);
    if (!item) throw new Error('This item is not available to read.');
    document.title = [item.title, item.author, 'Poetry, Please'].filter(Boolean).join(' · ');
    $('title').textContent = item.title;
    $('author').textContent = item.author;
    $('book').textContent = item.book;
    $('book').hidden = !item.book;
    $('kind').textContent = item.type === 'FP' ? 'Full poem' : item.type === 'EXC' ? 'Excerpt' : '';
    const content = $('content'); content.replaceChildren();
    if (['FP','EXC'].includes(item.type)) {
      const poem = document.createElement('div');
      poem.className = 'reading-poem'; poem.textContent = item.text;
      content.append(poem);
    } else if (['VV','YT','HV','VIDEO'].includes(item.type)) {
      const embed = videoEmbedUrl(item.mediaUrl);
      const video = document.createElement(embed ? 'iframe' : 'video');
      video.src = embed || item.mediaUrl;
      if (embed) {
        video.title = item.title || 'Poem video'; video.allowFullscreen = true;
        video.allow = 'fullscreen'; video.referrerPolicy = 'strict-origin-when-cross-origin';
        if (item.type === 'VV') video.className = 'vertical';
      } else { video.controls = true; video.playsInline = true; video.preload = 'metadata'; }
      content.append(video);
    } else if (item.mediaUrl) {
      const image = document.createElement('img'); image.src = item.mediaUrl;
      image.alt = [item.title,item.author].filter(Boolean).join(' · '); content.append(image);
    }
    const bookUrl = safeMediaUrl(item.bookUrl);
    $('book-link').hidden = !bookUrl;
    if (bookUrl) $('book-link').href = bookUrl;
    $('related').replaceChildren(); appendPoemLinks($('related'), data);
    $('reading').hidden = false; $('status').textContent = '';
  } catch (error) { $('status').textContent = error.message; $('retry').hidden = !id; }
}
$('retry').addEventListener('click', load);
load();
