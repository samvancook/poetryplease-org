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

// Where a photo starts. focus is the part of the photo that holds the poem text,
// as fractions [left, top, right, bottom] of the photo. The start view fills the
// frame with that part (never more than 3x); without one, the whole photo shows.
export function focusStart(focus, { width, height, imageWidth, imageHeight }) {
  const whole = { scale: 1, x: 0, y: 0 };
  if (!Array.isArray(focus) || focus.length !== 4 || !focus.every(Number.isFinite)) return whole;
  const [left, top, right, bottom] = focus;
  if (!(left >= 0 && top >= 0 && right <= 1 && bottom <= 1 && right > left && bottom > top)) return whole;
  const fit = Math.min(width / imageWidth, height / imageHeight);
  const shownWidth = imageWidth * fit, shownHeight = imageHeight * fit;
  const scale = Math.min(3, width / ((right - left) * shownWidth), height / ((bottom - top) * shownHeight));
  // A small gain isn't worth hiding part of the photo.
  if (!(scale >= 1.15)) return whole;
  return boundGraphicZoom({ scale, x: -((left + right) / 2 - .5) * shownWidth * scale,
    y: -((top + bottom) / 2 - .5) * shownHeight * scale }, { width, height, imageWidth, imageHeight });
}

export function attachGraphicZoom(card, focus) {
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
  // The start view: the whole photo, or its text part when the photo has a focus.
  // At the start view a one-finger swipe still moves to the next card.
  let home = { scale: 1, x: 0, y: 0 };
  const atStart = () => Math.abs(state.scale - home.scale) < .001 && Math.abs(state.x - home.x) < .5 && Math.abs(state.y - home.y) < .5;
  const userZoomed = () => state.scale > 1.001 && !atStart();
  let gesture;
  let suppressClickUntil = 0;
  let sharperRequested = false;
  const dimensions = () => ({ width: art.clientWidth, height: art.clientHeight,
    imageWidth: image.naturalWidth || art.clientWidth || 1, imageHeight: image.naturalHeight || art.clientHeight || 1 });
  function set(next) {
    state = boundGraphicZoom(next, dimensions());
    image.style.transform = `translate3d(${state.x}px,${state.y}px,0) scale(${state.scale})`;
    const zoomed = state.scale > 1.001;
    const moved = zoomed && !atStart();
    art.classList.toggle('graphic-zoomed', moved);
    art.classList.toggle('graphic-focused', zoomed && !moved);
    // The feed may be showing a light preview; the card swaps in the original
    // the first time someone zooms, so a zoomed graphic stays sharp.
    if (moved && !sharperRequested) { sharperRequested = true; card.dispatchEvent(new Event('graphiczoomstart')); }
    minus.hidden = fit.hidden = !zoomed;
    tools.classList.toggle('at-focus', zoomed && !moved);
    plus.disabled = state.scale >= 4;
    status.textContent = zoomed ? Math.round(state.scale * 100) + '%' : '';
    const ready = image.complete && image.naturalWidth > 0;
    tools.hidden = !ready;
    hint.textContent = ready ? (moved ? 'Drag to move · Fit to swipe' : zoomed ? 'Fit shows the whole photo · Tap for details'
      : 'Pinch or + to zoom · Tap for details') : 'Tap for details';
  }
  const ready = () => image.complete && image.naturalWidth > 0;
  const startView = () => (home = ready() && focus ? focusStart(focus, dimensions()) : { scale: 1, x: 0, y: 0 });
  const reset = () => { gesture = null; set({ ...startView() }); };
  card.addEventListener('graphiccardchange', reset);
  plus.addEventListener('click', () => set(zoomAround(state, state.scale + .5, { x: 0, y: 0 })));
  minus.addEventListener('click', () => set(zoomAround(state, state.scale - .5, { x: 0, y: 0 })));
  // Fit shows the whole photo; the next card change goes back to the start view.
  fit.addEventListener('click', () => { gesture = null; home = { scale: 1, x: 0, y: 0 }; set({ scale: 1, x: 0, y: 0 }); });
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
    } else if (event.touches.length === 1 && userZoomed()) {
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
    if (event.pointerType === 'touch' || event.button !== 0 || !userZoomed()) return;
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
    if (userZoomed() || performance.now() < suppressClickUntil) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  // The start view needs the photo's size, so it is worked out once it loads
  // (a sharper copy swapped in while zoomed keeps the reader's place).
  image.addEventListener('load', () => (atStart() || state.scale <= 1.001) && !gesture ? reset() : set(state));
  image.addEventListener('error', () => { tools.hidden = true; hint.textContent = 'Tap for details'; });
  reset();
  return { reset };
}
