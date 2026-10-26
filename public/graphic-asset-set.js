// Read-only display helper. Import validation is enforced by the server.
export function graphicCards(value) {
  if (!Array.isArray(value)) return [];
  return value.filter(card => card && Number.isInteger(card.index) && /^https:\/\//i.test(card.assetPreviewUrl || card.assetUrl || ''));
}
export function mountGraphicCardControls(container, cards, select) {
  if (cards.length < 2) return null;
  let position = 0;
  const controls = document.createElement('nav');
  controls.setAttribute('aria-label', 'Graphic cards');
  controls.className = 'graphic-card-controls';
  controls.style.cssText = 'display:flex;gap:12px;align-items:center;justify-content:center;position:relative;z-index:6;padding:8px;background:#000;color:#fff';
  const back = document.createElement('button'), next = document.createElement('button'), status = document.createElement('span');
  back.type = next.type = 'button';
  back.textContent = '←'; next.textContent = '→';
  back.setAttribute('aria-label', 'Previous graphic card'); next.setAttribute('aria-label', 'Next graphic card');
  status.setAttribute('role', 'status');
  function show(i) {
    position = i; back.disabled = i === 0; next.disabled = i === cards.length - 1;
    status.textContent = `Card ${i + 1} of ${cards.length}`;
    select(cards[i], i);
  }
  back.addEventListener('click', event => { event.stopPropagation(); if (position > 0) show(position - 1); });
  next.addEventListener('click', event => { event.stopPropagation(); if (position < cards.length - 1) show(position + 1); });
  controls.append(back, status, next); container.append(controls); show(0);
  return controls;
}
