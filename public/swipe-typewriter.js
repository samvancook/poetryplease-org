// Typewriter mode of Swipe (Sam, Nov 27 2026: the typewriter intro should switch
// the whole thing into typewriter mode). Started by swipe-intro.js when the
// typewriter intro plays; regular Swipe never loads this file.
// - Paper cards, typewriter faces, red ribbon ink for credits, keys for votes.
// - Excerpts type themselves out the first time they are on screen.
// - Later feed pages lead with typewriter quote images (scroll.js sends look=typewriter).

const FONTS = 'https://fonts.googleapis.com/css2?family=Special+Elite&family=Courier+Prime:ital,wght@0,400;0,700;1,400&display=swap';
const MAX_TYPED = 700; // longer excerpts appear at once

const STYLE = `
body.pp-typewriter{--tw-platen:#1c1a18;--tw-paper:#f3efe6;--tw-ink:#1f1d1a;--tw-ribbon:#b1281f;--tw-metal:#8d8a84;--tw-key:#2a2826;
  --tw-type:"Special Elite","Courier Prime","Courier New",Courier,monospace;--tw-body:"Courier Prime","Courier New",Courier,monospace;background:var(--tw-platen)}
html:has(body.pp-typewriter){background:var(--tw-platen)}
.pp-typewriter .site-header{background:var(--tw-platen);border-bottom:1px solid #000}
.pp-typewriter .brand{font:22px/1.2 var(--tw-type);letter-spacing:.02em;color:var(--tw-paper)}
.pp-typewriter .site-header .variant{font:11px/1 var(--tw-type);letter-spacing:.12em;text-transform:uppercase;color:var(--tw-paper);background:var(--tw-ribbon);padding:5px 7px 4px;transform:rotate(-2deg);margin-left:8px}
.pp-typewriter #account-toggle,.pp-typewriter .account-menu{font-family:var(--tw-body)}
.pp-typewriter .account-menu{background:var(--tw-platen)}
.pp-typewriter .contest-winners-promo{font-family:var(--tw-body);background:var(--tw-paper);border-color:var(--tw-paper);color:var(--tw-ink)}
.pp-typewriter .post-card{background:var(--tw-platen)}
.pp-typewriter .post-frame{background:var(--tw-paper);box-shadow:0 10px 28px rgba(0,0,0,.5);margin:10px 12px 0;height:calc(100% - 10px);width:auto;position:relative}
.pp-typewriter .post-art,.pp-typewriter .post-poem,.pp-typewriter .post-attribution{background:transparent}
.pp-typewriter .post-poem{color:var(--tw-ink)}
.pp-typewriter .post-poem .poem-lines{font:clamp(17px,4.6vw,21px)/1.6 var(--tw-type);text-shadow:0 0 .6px rgba(31,29,26,.55)}
.pp-typewriter .post-text-preview .post-poem{mask-image:none}
.pp-typewriter .post-attribution{color:var(--tw-ribbon);border-top:1px dashed #bdb5a4;margin:0 14px;width:auto}
.pp-typewriter .post-credit-kind{font:12px/1.4 var(--tw-body);color:#7a7265;font-style:normal;text-transform:uppercase;letter-spacing:.12em}
.pp-typewriter .post-credit-title{font:15px/1.4 var(--tw-body);font-weight:700;color:var(--tw-ink)}
.pp-typewriter .post-credit-author{font:13px/1.4 var(--tw-body);color:var(--tw-ribbon)}
.pp-typewriter .post-open-hint{font-family:var(--tw-body);color:#7a7265}
.pp-typewriter .post-unavailable{font-family:var(--tw-body);color:#7a7265}
.pp-typewriter .post-art img{box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.pp-typewriter .swipe-review-dock{background:linear-gradient(#24211f,#141312);border-top:1px solid #000}
.pp-typewriter .swipe-review .votes{gap:10px;justify-items:center}
.pp-typewriter .swipe-review .vote-button{width:min(72px,100%);min-height:0;aspect-ratio:1;justify-self:center;border-radius:50%;border:3px solid var(--tw-metal);
  background:radial-gradient(circle at 50% 38%,#3a3734,var(--tw-key) 70%);box-shadow:0 5px 0 #0b0a09,inset 0 2px 0 rgba(255,255,255,.12);color:var(--tw-paper);
  font:11px/1.1 var(--tw-type);letter-spacing:.06em;text-transform:uppercase;transition:transform .06s,box-shadow .06s;padding:4px}
.pp-typewriter .swipe-review .vote-button:active{transform:translateY(4px);box-shadow:0 1px 0 #0b0a09}
.pp-typewriter .swipe-review .vote-button[aria-pressed="true"]{border-color:var(--tw-paper);background:radial-gradient(circle at 50% 38%,#4a3a38,#3a1d1a 70%)}
.pp-typewriter .swipe-review .vote-button .emoji{width:22px;height:22px;margin-bottom:3px}
.pp-typewriter .swipe-review .vote-button .emoji svg{width:20px;height:20px}
.pp-typewriter .swipe-review .card-status{font-family:var(--tw-body);color:var(--tw-paper)}
.pp-typewriter .swipe-zoom-tools button{background:var(--tw-platen);font-family:var(--tw-body)}
.pp-typewriter .feed-footer{font-family:var(--tw-body);color:var(--tw-paper);background:var(--tw-platen)}
.pp-tw-caret{display:inline-block;width:.55em;height:1.05em;vertical-align:-.15em;background:var(--tw-ribbon);opacity:.85;animation:pp-tw-blink 1s steps(1) infinite}
@keyframes pp-tw-blink{50%{opacity:0}}
.pp-tw-stamp{position:absolute;left:50%;top:42%;z-index:2;transform:translate(-50%,-50%) rotate(-9deg);font:28px var(--tw-type);letter-spacing:.2em;color:var(--tw-ribbon);
  border:3px solid var(--tw-ribbon);padding:6px 14px 4px;opacity:.82;mix-blend-mode:multiply;pointer-events:none;animation:pp-tw-stamp .18s ease-out}
@keyframes pp-tw-stamp{from{transform:translate(-50%,-50%) rotate(-9deg) scale(1.6);opacity:0}}
@media (prefers-reduced-motion:reduce){.pp-tw-caret,.pp-tw-stamp{animation:none}}`;

let started = false;

// Type a card's excerpt out once, line by line in its existing spans. Tapping
// the card (which opens it) or scrolling away finishes it at once.
function typeOut(card, reduce) {
  if (card.dataset.twTyped) return;
  card.dataset.twTyped = '1';
  if (!card.querySelector('.post-text-preview') || card.querySelector('.post-full-poem')) return;
  const lines = [...card.querySelectorAll('.poem-line')];
  const full = lines.map(line => line.textContent);
  if (reduce || !lines.length || full.join('').length > MAX_TYPED) return;
  lines.forEach(line => { line.textContent = ' '; });
  const caret = document.createElement('span');
  caret.className = 'pp-tw-caret';
  caret.setAttribute('aria-hidden', 'true');
  let row = 0, at = 0, timer = 0;
  const finish = () => {
    clearTimeout(timer);
    lines.forEach((line, i) => { line.textContent = full[i] || ' '; });
    caret.remove();
    card.removeEventListener('pointerdown', finish);
  };
  card.addEventListener('pointerdown', finish, { once: true });
  card._twFinish = finish;
  const step = () => {
    if (!card.isConnected) return;
    if (row >= lines.length) { caret.remove(); return; }
    const text = full[row];
    if (at === 0) { lines[row].textContent = ''; lines[row].append(caret); }
    if (at < text.length) {
      const ch = text[at++];
      caret.before(ch);
      timer = setTimeout(step, /[,.;:!?]/.test(ch) ? 140 : 28 + Math.random() * 30);
    } else {
      if (!text) lines[row].textContent = ' ';
      row += 1; at = 0;
      timer = setTimeout(step, 260);
    }
  };
  step();
}

export function startTypewriterMode() {
  if (started) return;
  started = true;
  window.ppFeedLook = 'typewriter';
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fonts = document.createElement('link');
  fonts.rel = 'stylesheet';
  fonts.href = FONTS;
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.append(fonts, style);
  document.body.classList.add('pp-typewriter');
  const variant = document.querySelector('.site-header .variant');
  if (variant) variant.textContent = 'Typewriter';

  const feed = document.getElementById('feed');
  if (!feed) return;
  // posts-swipe.js marks the card on screen with .swipe-current.
  const watch = new MutationObserver(records => {
    for (const record of records) {
      const card = record.target;
      if (!card.classList?.contains('post-card')) continue;
      if (card.classList.contains('swipe-current')) typeOut(card, reduce);
      else card._twFinish?.();
    }
  });
  watch.observe(feed, { subtree: true, attributes: true, attributeFilter: ['class'] });
  const current = feed.querySelector('.post-card.swipe-current');
  if (current) typeOut(current, reduce);

  // A vote stamps the sheet in red ribbon ink.
  document.addEventListener('click', event => {
    const button = event.target.closest?.('.swipe-review-dock .vote-button');
    if (!button) return;
    const card = feed.querySelector('.post-card.swipe-current .post-frame');
    if (!card) return;
    card.querySelector('.pp-tw-stamp')?.remove();
    const stamp = document.createElement('div');
    stamp.className = 'pp-tw-stamp';
    stamp.setAttribute('aria-hidden', 'true');
    stamp.textContent = (button.getAttribute('aria-label') || '').toUpperCase();
    card.append(stamp);
  });
}
