// Wrap while the whole logo is offscreen, so the next cycle has no visible jump.
export function moonPosition(scrollY, viewportHeight, diameter) {
  const distance = viewportHeight + diameter + 96;
  const progress = Math.max(0, scrollY) * .18 + distance * .52;
  return viewportHeight + 48 - (progress % distance);
}

if (typeof document !== 'undefined') {
  const moon = document.getElementById('post-moon');
  if (moon) {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    let height = innerHeight;
    let diameter = moon.getBoundingClientRect().width;
    let pending = false;
    function paint() {
      pending = false;
      const y = moonPosition(reduced.matches ? 0 : scrollY, height, diameter);
      moon.style.transform = `translate3d(-42%, ${y}px, 0)`;
    }
    function queuePaint() {
      if (!pending && !reduced.matches) {
        pending = true;
        requestAnimationFrame(paint);
      }
    }
    function resize() {
      height = innerHeight;
      diameter = moon.getBoundingClientRect().width;
      paint();
    }
    addEventListener('scroll', queuePaint, { passive: true });
    addEventListener('resize', resize, { passive: true });
    reduced.addEventListener('change', paint);
    paint();
  }
}
