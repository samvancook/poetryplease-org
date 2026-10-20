export function zoomAround(state, scale, from, to = from) {
  scale = Math.max(1, Math.min(4, scale));
  const ratio = scale / state.scale;
  return { scale, x: to.x - (from.x - state.x) * ratio, y: to.y - (from.y - state.y) * ratio };
}

export function boundGraphicZoom(state, { width, height, imageWidth, imageHeight }) {
  const scale = Math.max(1, Math.min(4, state.scale));
  const fit = Math.min(width / imageWidth, height / imageHeight);
  const maxX = Math.max(0, (imageWidth * fit * scale - width) / 2);
  const maxY = Math.max(0, (imageHeight * fit * scale - height) / 2);
  return { scale, x: Math.max(-maxX, Math.min(maxX, state.x)), y: Math.max(-maxY, Math.min(maxY, state.y)) };
}

export function attachGraphicZoom(card) {
  const image = card.querySelector('.post-art > img');
  if (!image) return null;
  const art = image.parentElement;
  art.classList.add('swipe-graphic');
  const hint = card.querySelector('.post-open-hint');
  const tools = document.createElement('div');
  tools.className = 'swipe-zoom-tools';
  tools.setAttribute('role', 'group');
  tools.setAttribute('aria-label', 'Graphic zoom');
  const button = (text, label) => {
    const control = document.createElement('button');
    control.type = 'button'; control.textContent = text;
    control.setAttribute('aria-label', label); control.title = label;
    tools.append(control);
    return control;
  };
  const minus = button('−', 'Zoom out of graphic');
  const plus = button('+', 'Zoom in on graphic');
  const fit = button('Fit', 'Reset graphic zoom');
  const status = document.createElement('span');
  status.className = 'swipe-zoom-status';
  status.setAttribute('role', 'status');
  tools.append(status);
  card.append(tools);
  let state = { scale: 1, x: 0, y: 0 };
  let gesture;
  let suppressClickUntil = 0;
  const dimensions = () => ({ width: art.clientWidth, height: art.clientHeight,
    imageWidth: image.naturalWidth || art.clientWidth || 1, imageHeight: image.naturalHeight || art.clientHeight || 1 });
  function set(next) {
    state = boundGraphicZoom(next, dimensions());
    image.style.transform = `translate3d(${state.x}px,${state.y}px,0) scale(${state.scale})`;
    const zoomed = state.scale > 1.001;
    art.classList.toggle('graphic-zoomed', zoomed);
    minus.hidden = fit.hidden = !zoomed;
    plus.disabled = state.scale >= 4;
    status.textContent = zoomed ? Math.round(state.scale * 100) + '%' : '';
    const ready = image.complete && image.naturalWidth > 0;
    tools.hidden = !ready;
    hint.textContent = ready ? (zoomed ? 'Drag to move · Fit to swipe' : 'Pinch or + to zoom · Tap for details') : 'Tap for details';
  }
  const reset = () => { gesture = null; set({ scale: 1, x: 0, y: 0 }); };
  plus.addEventListener('click', () => set(zoomAround(state, state.scale + .5, { x: 0, y: 0 })));
  minus.addEventListener('click', () => set(zoomAround(state, state.scale - .5, { x: 0, y: 0 })));
  fit.addEventListener('click', reset);
  const touchPoint = touch => {
    const rect = art.getBoundingClientRect();
    return { x: touch.clientX - rect.left - rect.width / 2, y: touch.clientY - rect.top - rect.height / 2 };
  };
  const pair = touches => {
    const a = touchPoint(touches[0]), b = touchPoint(touches[1]);
    return { center: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)) };
  };
  function start(event) {
    if (event.touches.length >= 2) {
      event.preventDefault();
      gesture = { ...pair(event.touches), state: { ...state }, pinch: true };
      suppressClickUntil = performance.now() + 500;
    } else if (event.touches.length === 1 && state.scale > 1) {
      event.preventDefault();
      gesture = { center: touchPoint(event.touches[0]), state: { ...state }, pinch: false };
      suppressClickUntil = performance.now() + 500;
    }
  }
  art.addEventListener('touchstart', start, { passive: false });
  art.addEventListener('touchmove', event => {
    if (!gesture) return;
    event.preventDefault();
    suppressClickUntil = performance.now() + 500;
    if (event.touches.length >= 2) {
      if (!gesture.pinch) { start(event); return; }
      const next = pair(event.touches);
      set(zoomAround(gesture.state, gesture.state.scale * next.distance / gesture.distance, gesture.center, next.center));
    } else if (event.touches.length === 1) {
      if (gesture.pinch) { start(event); return; }
      const next = touchPoint(event.touches[0]);
      set({ scale: state.scale, x: gesture.state.x + next.x - gesture.center.x, y: gesture.state.y + next.y - gesture.center.y });
    }
  }, { passive: false });
  art.addEventListener('touchend', event => {
    if (!gesture) return;
    suppressClickUntil = performance.now() + 500;
    gesture = null;
    if (event.touches.length) start(event);
  });
  art.addEventListener('touchcancel', () => { gesture = null; suppressClickUntil = performance.now() + 500; });
  art.addEventListener('pointerdown', event => {
    if (event.pointerType === 'touch' || event.button !== 0 || state.scale <= 1) return;
    event.preventDefault();
    art.setPointerCapture(event.pointerId);
    gesture = { pointerId: event.pointerId, center: touchPoint(event), state: { ...state } };
  });
  art.addEventListener('pointermove', event => {
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const next = touchPoint(event);
    set({ scale: state.scale, x: gesture.state.x + next.x - gesture.center.x, y: gesture.state.y + next.y - gesture.center.y });
    suppressClickUntil = performance.now() + 500;
  });
  for (const name of ['pointerup', 'pointercancel']) art.addEventListener(name, event => {
    if (gesture?.pointerId === event.pointerId) { gesture = null; suppressClickUntil = performance.now() + 500; }
  });
  art.addEventListener('click', event => {
    if (state.scale > 1 || performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  image.addEventListener('load', () => set(state));
  image.addEventListener('error', () => { tools.hidden = true; hint.textContent = 'Tap for details'; });
  reset();
  return { reset };
}
