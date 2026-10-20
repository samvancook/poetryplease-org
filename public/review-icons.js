// Explicit SVG shapes keep the black fill and colored edge consistent across
// iPhone, Android and desktop; platform emoji cannot guarantee that treatment.
const icons = {
  'moved me': { color: '#ff5365', paths: ['M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z'] },
  meh: { color: '#f5ce48', face: true },
  like: { color: '#f5c45b', thumb: true },
  dislike: { color: '#f5c45b', thumb: true, down: true },
};
const svgNS = 'http://www.w3.org/2000/svg';
export function createReviewIcon(value) {
  const icon = icons[value];
  if (!icon) throw new Error('Unknown review icon');
  const svg = document.createElementNS(svgNS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'review-icon');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('fill', '#000');
  svg.setAttribute('stroke', icon.color);
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const shape = (tag, attrs) => {
    const element = document.createElementNS(svgNS, tag);
    for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
    svg.append(element);
  };
  if (icon.face) {
    shape('circle', { cx: 12, cy: 12, r: 9 });
    shape('path', { d: 'M8 15h8' });
    for (const cx of [8.5, 15.5]) shape('circle', { cx, cy: 9, r: .7, fill: icon.color, stroke: 'none' });
  } else if (icon.thumb) {
    const transform = icon.down ? 'rotate(180 12 12)' : '';
    shape('path', { d: 'M8 10v11H3V10Z', transform });
    shape('path', { d: 'M8 10l4-7c.5-.9 2-.5 2 1v5h5a2 2 0 0 1 2 2.4l-1.4 7A3.2 3.2 0 0 1 16.5 21H8Z', transform });
  } else {
    for (const d of icon.paths) shape('path', { d });
  }
  return svg;
}
