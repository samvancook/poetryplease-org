(function () {
  const auth = firebase.auth();
  const provider = new firebase.auth.GoogleAuthProvider();
  const PP = (window.PP = Object.assign({}, window.PP));
  const $ = (s, r = document) => r.querySelector(s);

  async function signInWithGoogle() {
    try {
      await auth.signInWithPopup(provider);
    } catch (e) {
      try { await auth.signOut(); } catch (_) {}
      await auth.signInWithRedirect(provider);
    }
  }

  function pick(o, keys, fallback) {
    if (!o) return fallback;
    for (const key of keys) {
      const value = o[key];
      if (value != null && String(value).trim() !== '') return value;
    }
    return fallback;
  }

  function setTxt(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = (value && String(value).trim()) || '—';
  }

  function extractFields(txt) {
    const out = {};
    const grab = (re) => {
      const m = txt.match(re);
      return m ? m[1].trim() : null;
    };
    out.title = grab(/^\s*(?:Poem|Title)\s*:\s*(.+)$/im) || null;
    out.author = grab(/^\s*Author\s*:\s*(.+)$/im) || null;
    out.book = grab(/^\s*(?:their|the)?\s*book\s*:\s*(.+)$/im)
      || grab(/from\s+(?:the|their)?\s*book\s*:\s*(.+)$/im)
      || null;
    const c = txt.match(/Likes:\s*(\d+).*?Dislikes:\s*(\d+).*?Skips:\s*(\d+)/i);
    if (c) out.counters = `Likes: ${c[1]} • Dislikes: ${c[2]} • Skips: ${c[3]}`;
    return out;
  }

  function harvestAndPurge() {
    const wrap = $('.wrap');
    if (!wrap) return;
    const kids = Array.from(wrap.children);
    const headerIdx = kids.findIndex((n) => n.tagName === 'HEADER');
    const mediaIdx = kids.findIndex((n) => n.classList && n.classList.contains('media-outer'));
    if (headerIdx < 0 || mediaIdx < 0 || mediaIdx <= headerIdx) return;

    const slice = kids.slice(headerIdx + 1, mediaIdx);
    let combined = '';
    for (const el of slice) combined += `\n${el.innerText || el.textContent || ''}`;
    const scraped = extractFields(combined);
    for (const el of slice) el.remove();

    const item = window.currentItem || {};
    const book = pick(item, ['book', 'bookTitle', 'collection'], scraped.book) || '—';
    const title = pick(item, ['title', 'poemTitle', 'name'], scraped.title) || '—';
    const author = pick(item, ['author', 'authorName', 'writer'], scraped.author) || '—';

    setTxt('info-book', book);
    setTxt('info-title', title);
    setTxt('info-author', author);

    if (scraped.counters) {
      const c = document.getElementById('info-counters');
      if (c) c.textContent = scraped.counters;
    }
  }

  PP.toggleInfo = function (open) {
    const el = document.getElementById('pp-info');
    if (!el) return;
    if (open) {
      PP.updateInfo(window.currentItem);
      setTimeout(() => PP.updateInfo(window.currentItem), 0);
    }
    el.dataset.open = open ? 'true' : 'false';
  };

  PP.updateInfo = function (item) {
    item = item || window.currentItem || {};
    setTxt('info-book', pick(item, ['book', 'bookTitle', 'collection', 'series'], null));
    setTxt('info-title', pick(item, ['title', 'poemTitle', 'name'], null));
    setTxt('info-author', pick(item, ['author', 'authorName', 'writer'], null));
    const likes = pick(item, ['likes', 'likeCount'], 0) ?? 0;
    const dislikes = pick(item, ['dislikes', 'dislikeCount'], 0) ?? 0;
    const skips = pick(item, ['skips', 'skipCount'], 0) ?? 0;
    const c = document.getElementById('info-counters');
    if (c) c.textContent = `Likes: ${likes} • Dislikes: ${dislikes} • Skips: ${skips}`;
    harvestAndPurge();
  };

  function mountControls() {
    if (document.getElementById('btnSkip')) return;
    const bar = document.createElement('div');
    bar.className = 'sticky-controls';
    bar.innerHTML = `
      <div class="controls">
        <button id="btnBack">Go Back</button>
        <button id="btnBook">Take me to the book</button>
        <button id="btnMoreInfo">More Info</button>
        <button id="btnSkip">Poetry, Please</button>
      </div>
    `;
    document.body.appendChild(bar);
    $('#btnBack')?.addEventListener('click', () => PP.goBack && PP.goBack());
    $('#btnBook')?.addEventListener('click', () => PP.openBook && PP.openBook());
    $('#btnSkip')?.addEventListener('click', () => PP.skip && PP.skip());
    $('#btnMoreInfo')?.addEventListener('click', () => PP.toggleInfo(true));
  }

  document.getElementById('mobile-google')?.addEventListener('click', signInWithGoogle);
  auth.getRedirectResult().catch(console.error);
  auth.onAuthStateChanged((u) => {
    const status = document.getElementById('mobile-login-status');
    if (status) status.textContent = u ? (u.email || 'Signed in') : 'Signed out';
  });

  document.getElementById('info-filter-author')?.addEventListener('change', (e) => {
    if (PP.setFilter) PP.setFilter('author', !!e.target.checked);
    else window.PP_FILTER_AUTHOR = !!e.target.checked;
  });
  document.getElementById('info-filter-book')?.addEventListener('change', (e) => {
    if (PP.setFilter) PP.setFilter('book', !!e.target.checked);
    else window.PP_FILTER_BOOK = !!e.target.checked;
  });

  window.addEventListener('pp:state', (e) => {
    const item = e?.detail?.item || e?.detail?.current || e?.detail || null;
    if (item) window.currentItem = item;
    PP.updateInfo(window.currentItem);
    if (!document.getElementById('btnSkip')) mountControls();
  }, { passive: true });

  const wrap = document.querySelector('.wrap');
  if (wrap) {
    new MutationObserver(() => harvestAndPurge())
      .observe(wrap, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountControls, { once: true });
  } else {
    mountControls();
  }

  setTimeout(() => PP.updateInfo(window.currentItem || {}), 100);
  setTimeout(() => {
    if (!window.currentItem && window.onSkip) onSkip();
  }, 800);
})();
