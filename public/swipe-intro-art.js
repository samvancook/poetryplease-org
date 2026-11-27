// Hand-drawn intro art for the Swipe intro test (see swipe-intro.js).
// Loaded only for visitors in an intro group; nothing else imports it.
// White line on black, redrawn about 8 times a second with a seeded wobble
// so the lines "boil" like hand-inked animation.
const TAU = Math.PI * 2, W = 360, H = 480, INK = '#fff', BG = '#000';
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (t, a, b) => clamp((t - a) / (b - a));
const ease = u => u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
const easeOut = u => 1 - Math.pow(1 - u, 3);
const easeIn = u => u * u;
const backOut = u => { const c = 1.5; return 1 + (c + 1) * Math.pow(u - 1, 3) + c * Math.pow(u - 1, 2); };
const lerp = (a, b, u) => a + (b - a) * u;



function rnd(a, b, c) {
  let h = Math.imul(a | 0, 0x9E3779B1) ^ Math.imul((b | 0) + 0x7F4A7C15, 0x85EBCA77) ^ Math.imul((c | 0) + 0x165667B1, 0xC2B2AE3D);
  h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; h = Math.imul(h, 0x297A2D39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}
function arcPts(cx, cy, rx, ry, a0, a1, n) {
  const p = [];
  for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; p.push([cx + rx * Math.cos(a), cy + ry * Math.sin(a)]); }
  return p;
}

// A pen that redraws every line with a small, seeded wobble. The seed changes a few
// times a second ("boil"), the way hand-inked cels never line up exactly.
class Pen {
  constructor(ctx) { this.ctx = ctx; }
  begin(boil, on) { this.boil = boil; this.on = on; this.id = 0; }
  jit(i, amp) {
    if (!this.on) return [0, 0];
    const s = this.id * 977 + i;
    return [(rnd(this.boil, s, 1) - .5) * 2 * amp, (rnd(this.boil, s, 2) - .5) * 2 * amp];
  }
  trace(pts, o) {
    this.id++;
    const amp = o.amp ?? 1.1, step = o.step ?? 13, out = [], n = pts.length;
    let k = 0;
    const segs = o.closed ? n : n - 1;
    for (let i = 0; i < segs; i++) {
      const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
      const m = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
      for (let j = 0; j < m; j++) { const u = j / m, d = this.jit(k++, amp); out.push([x1 + (x2 - x1) * u + d[0], y1 + (y2 - y1) * u + d[1]]); }
    }
    if (o.closed) out.push(out[0]);
    else { const d = this.jit(k++, amp); out.push([pts[n - 1][0] + d[0], pts[n - 1][1] + d[1]]); }
    return out;
  }
  path(out) {
    const c = this.ctx;
    c.beginPath(); c.moveTo(out[0][0], out[0][1]);
    if (out.length < 3) { c.lineTo(out[out.length - 1][0], out[out.length - 1][1]); return; }
    for (let i = 1; i < out.length - 1; i++) {
      const mx = (out[i][0] + out[i + 1][0]) / 2, my = (out[i][1] + out[i + 1][1]) / 2;
      c.quadraticCurveTo(out[i][0], out[i][1], mx, my);
    }
    c.lineTo(out[out.length - 1][0], out[out.length - 1][1]);
  }
  stroke(pts, o = {}) {
    const c = this.ctx, out = this.trace(pts, o);
    this.path(out);
    if (o.fill) { c.fillStyle = o.fill; c.fill(); }
    if (o.w !== 0) { c.lineWidth = o.w ?? 2; c.strokeStyle = o.color ?? INK; c.stroke(); }
  }
  circle(cx, cy, r, o = {}) {
    const start = o.start ?? rnd(this.id + 1, 7, 3) * TAU;
    const over = o.fill ? 0.12 : 0.28;
    const n = Math.max(10, Math.ceil((TAU + over) * r / 8));
    this.stroke(arcPts(cx, cy, r, r, start, start + TAU + over, n), { ...o, step: 1e9, amp: Math.min(o.amp ?? 1.1, r * .12 + .25) });
  }
  // Two parallel rails: a wide white stroke with a slightly narrower black one on top.
  tube(pts, width, o = {}) {
    const c = this.ctx, out = this.trace(pts, { step: 12, amp: o.amp ?? 1 });
    c.save(); c.lineCap = 'butt'; c.lineJoin = 'round';
    this.path(out); c.lineWidth = width + 4; c.strokeStyle = INK; c.stroke();
    this.path(out); c.globalAlpha = 1; c.lineWidth = width; c.strokeStyle = BG; c.stroke();
    c.restore();
  }
  text(str, x, y, o = {}) {
    const c = this.ctx; this.id++;
    const d = this.jit(0, .5);
    c.save();
    c.font = o.font ?? '700 10px system-ui, sans-serif';
    c.fillStyle = o.color ?? INK; c.textBaseline = 'middle';
    const ls = o.ls ?? 0;
    const chars = [...str], widths = chars.map(ch => c.measureText(ch).width);
    const total = widths.reduce((a, b) => a + b, 0) + ls * (chars.length - 1);
    let cx = x + d[0] - (o.align === 'left' ? 0 : o.align === 'right' ? total : total / 2);
    c.textAlign = 'left';
    chars.forEach((ch, i) => { c.fillText(ch, cx, y + d[1]); cx += widths[i] + ls; });
    c.restore();
  }
}

function capsule(pen, x, y, r, rot, open = 0) {
  const c = pen.ctx;
  c.save(); c.translate(x, y); c.rotate(rot);
  if (open <= 0) {
    pen.circle(0, 0, r, { fill: BG });
    pen.stroke([[-r + 1.5, 0], [r - 1.5, 0]], { w: 1.4, amp: .6 });
    pen.stroke([[-r * .45, -r * .38], [r * .4, -r * .55]], { w: 1.3, amp: .5 });
    pen.stroke([[-r * .38, -r * .16], [r * .46, -r * .3]], { w: 1.3, amp: .5 });
  } else {
    pen.stroke(arcPts(0, 0, r, r, 0, Math.PI, 14), { closed: true, fill: BG, step: 1e9, amp: .9 });
    c.save(); c.translate(-r, -open * 5); c.rotate(-open * 1.2); c.translate(r, 0);
    pen.stroke(arcPts(0, 0, r, r, Math.PI, TAU, 14), { closed: true, fill: BG, step: 1e9, amp: .9 });
    c.restore();
  }
  c.restore();
}

// The capsule's slip unrolls into a numbered ticket and the poem types itself in.
// o.instant shows the text at once (typed or printed already); o.font changes the
// poem face; o.size is the [w, h] the slip grows from.
function slip(pen, t, t0, from, poem, ticket, o = {}) {
  const c = pen.ctx, g = (o.size ? easeOut : backOut)(seg(t, t0, t0 + .7));
  if (g <= 0) return;
  const fw = 288, fh = 40 + poem.lines.length * 26 + 30;
  const cx = lerp(from[0], 180, g), cy = lerp(from[1], 236, g);
  const w = lerp(o.size ? o.size[0] : 8, fw, g), h = lerp(o.size ? o.size[1] : 10, fh, g);
  const x = cx - w / 2, y = cy - h / 2;
  const fold = 14 * clamp(g);
  pen.stroke([[x, y], [x + w - fold, y], [x + w, y + fold], [x + w, y + h], [x, y + h]], { closed: true, fill: BG, w: 2 });
  if (fold > 2) pen.stroke([[x + w - fold, y], [x + w - fold, y + fold], [x + w, y + fold]], { w: 1.4, amp: .5 });
  if (g < .95) return;
  c.save(); c.globalAlpha *= seg(t, t0 + .6, t0 + .9);
  pen.text('POEM No. ' + String(ticket).padStart(4, '0'), x + 16, y + 20, { align: 'left', ls: 1.6, font: '700 9px system-ui, sans-serif' });
  pen.stroke([[x + 14, y + 31], [x + w - 14, y + 31]], { w: 1, amp: .5 });
  c.restore();
  let budget = o.instant ? 1e6 : Math.floor((t - t0 - .85) * 34);
  poem.lines.forEach((line, i) => {
    if (budget <= 0) return;
    const shown = line.slice(0, budget); budget -= line.length + 3;
    pen.text(shown, x + 18, y + 52 + i * 26, { align: 'left', font: o.font || 'italic 19px Georgia, serif' });
  });
  if (budget > 0) {
    c.save(); c.globalAlpha *= o.instant ? 1 : clamp(budget / 20);
    pen.text('— ' + poem.by.toUpperCase(), x + w - 16, y + h - 16, { align: 'right', ls: 1.4, font: '700 9px system-ui, sans-serif' });
    c.restore();
  }
}

function ground(pen, y, x0, x1) {
  pen.stroke([[x0, y], [lerp(x0, x1, .58), y + .5]], { w: 1.8 });
  pen.stroke([[lerp(x0, x1, .62), y], [x1, y - .5]], { w: 1.8 });
}

/* ---------------- Gumball dispenser ---------------- */
const gumball = (() => {
  const G = { x: 150, y: 128, r: 96 };
  const chute = [];
  const ln = (x1, y1, x2, y2) => { const m = Math.ceil(Math.hypot(x2 - x1, y2 - y1) / 3); for (let i = chute.length ? 1 : 0; i <= m; i++) chute.push([x1 + (x2 - x1) * i / m, y1 + (y2 - y1) * i / m]); };
  const ar = (cx, cy, r, a0, a1) => { const m = Math.ceil(Math.abs(a1 - a0) * r / 3); for (let i = 1; i <= m; i++) { const a = a0 + (a1 - a0) * i / m; chute.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]); } };
  ln(194, 250, 302, 266);
  ar(302, 286, 20, -Math.PI / 2, Math.PI / 2);
  ln(302, 306, 252, 318);
  ar(252, 338, 20, -Math.PI / 2, -3 * Math.PI / 2);
  ln(252, 358, 302, 368);
  ar(302, 392, 24, -Math.PI / 2, 0);
  ln(326, 392, 326, 414);
  const cum = [0];
  for (let i = 1; i < chute.length; i++) cum.push(cum[i - 1] + Math.hypot(chute[i][0] - chute[i - 1][0], chute[i][1] - chute[i - 1][1]));
  const L = cum[cum.length - 1];
  const at = s => {
    let i = 1; while (i < cum.length - 1 && cum[i] < s) i++;
    const u = clamp((s - cum[i - 1]) / (cum[i] - cum[i - 1] || 1));
    return [lerp(chute[i - 1][0], chute[i][0], u), lerp(chute[i - 1][1], chute[i][1], u)];
  };
  const rows = [
    [104, [122, 152, 181]],
    [129, [96, 127, 158, 188, 212]],
    [154, [84, 114, 143, 172, 201]],
    [179, [97, 127, 158, 188]],
    [203, [120, 150, 180]],
  ];
  const balls = [];
  rows.forEach(([y, xs], ri) => xs.forEach((x, i) => balls.push({ x: x + (rnd(ri, i, 9) - .5) * 4, y: y + (rnd(ri, i, 8) - .5) * 3, rot: rnd(ri, i, 5) * TAU, chosen: ri === 4 && i === 1 })));
  const R = 13, bodyEdge = y => 192 + (y - 236) / 204 * 24;
  const T = { crank0: .8, crank1: 2.1, sink0: 1.6, sink1: 2.2, chute0: 2.45, chute1: 4.35, out1: 5.0, open0: 5.15, slip0: 5.6, fade: 10.4, end: 10.9 };

  function draw(pen, t, opts) {
    const c = pen.ctx;
    const reveal = seg(t, T.slip0 - .2, T.slip0 + .4);
    c.save(); c.globalAlpha *= lerp(1, .26, reveal);
    ground(pen, 440, 26, 344);
    // body
    pen.stroke([[108, 236], [192, 236], [216, 440], [84, 440]], { closed: true, fill: BG });
    pen.stroke([[92, 424], [208, 424]], { w: 1.4 });
    // coin slot and crank
    pen.stroke([[141, 262], [159, 262]], { w: 2.4, amp: .4 });
    pen.circle(150, 304, 27);
    pen.circle(150, 304, 6, { fill: INK });
    const th = -Math.PI / 2 + ease(seg(t, T.crank0, T.crank1)) * TAU;
    const hx = 150 + Math.cos(th) * 21, hy = 304 + Math.sin(th) * 21;
    pen.stroke([[150, 304], [hx, hy]], { w: 3, amp: .5 });
    pen.circle(hx, hy, 5.5, { fill: BG });
    pen.text('ONE TURN', 150, 360, { ls: 2.2 });
    pen.text('ONE POEM', 150, 376, { ls: 2.2 });
    pen.text('POETRY, PLEASE', 150, 404, { ls: 1.6, font: '700 9px system-ui, sans-serif' });
    // port on the body's right edge
    pen.stroke(arcPts(bodyEdge(250), 250, 7, 16, -Math.PI / 2, Math.PI / 2, 8), { w: 2 });
    // chute
    pen.tube(chute, 30);
    pen.stroke([[338, 300], [342, 312]], { w: 1.2, amp: .4 });
    pen.stroke([[340, 404], [343, 410]], { w: 1.2, amp: .4 });
    // globe contents
    const shake = t > T.crank0 && t < T.crank1 ? 1 : 0;
    c.save(); c.beginPath(); c.arc(G.x, G.y, G.r - 2, 0, TAU); c.clip();
    balls.forEach((b, i) => {
      let x = b.x, y = b.y;
      if (shake) { x += Math.sin(t * 38 + i) * 1.3; y += Math.cos(t * 31 + i * 2) * 1; }
      if (b.chosen) { y += easeIn(seg(t, T.sink0, T.sink1)) * 46; if (t > T.sink1) return; }
      capsule(pen, x, y, 15, b.rot);
    });
    c.restore();
    pen.circle(G.x, G.y, G.r, { w: 2.2 });
    pen.stroke(arcPts(G.x, G.y, G.r - 14, G.r - 14, Math.PI * 1.08, Math.PI * 1.32, 6), { w: 1.6 });
    pen.stroke(arcPts(G.x, G.y, G.r - 14, G.r - 14, Math.PI * 1.38, Math.PI * 1.44, 3), { w: 1.6 });
    // lid and collar
    pen.stroke(arcPts(150, 41, 40, 20, Math.PI, TAU, 12), { closed: true, fill: BG });
    pen.circle(150, 17, 6, { fill: BG });
    pen.stroke([[112, 222], [188, 222], [188, 236], [112, 236]], { closed: true, fill: BG });
    c.restore();

    // the travelling capsule
    let pos = null, rot = 0;
    if (t >= T.chute0 && t < T.chute1) {
      const u = seg(t, T.chute0, T.chute1), s = L * (.3 * u + .7 * u * u);
      pos = at(s); rot = s / R;
    } else if (t >= T.chute1) {
      const u = seg(t, T.chute1, T.out1), d = easeOut(u) * 62;
      const bounce = Math.abs(Math.sin(u * Math.PI * 2.2)) * 12 * (1 - u) * (1 - u);
      pos = [326 - d, lerp(414, 427, seg(t, T.chute1, T.chute1 + .08)) - bounce];
      rot = L / R - d / R;
    }
    if (pos) {
      c.save(); c.globalAlpha *= lerp(1, .55, reveal);
      capsule(pen, pos[0], pos[1], R, rot, easeOut(seg(t, T.open0, T.open0 + .35)));
      c.restore();
      slip(pen, t, T.slip0, [pos[0], pos[1] - 10], opts.poem, opts.ticket);
    }
  }
  return { draw, duration: T.end, fade: T.fade, still: 8.6 };
})();

/* ---------------- Claw machine ---------------- */
const claw = (() => {
  const RAIL = 88, CARRIAGE = 96, HOME = 84, TARGET = 230, R = 15;
  const pile = [];
  [[315, [140, 170, 200, 230, 260, 291]], [289, [155, 185, 215, 245, 275, 303]], [263, [170, 200, 260, 289]], [238, [200, 262]]]
    .forEach(([y, xs], ri) => xs.forEach((x, i) => pile.push({ x: x + (rnd(ri, i, 4) - .5) * 4, y, rot: rnd(ri, i, 6) * TAU })));
  const prize = { x: TARGET, y: 239, rot: .4 };
  const T = { move0: .7, move1: 2.1, down0: 2.5, down1: 3.6, close0: 3.7, close1: 4.15, up0: 4.25, up1: 5.1, back0: 5.25, back1: 6.65, release: 6.95, fall1: 7.35, door0: 7.3, out0: 7.55, out1: 8.25, open0: 8.35, slip0: 8.75, fade: 13.3, end: 13.8 };
  const X = t => lerp(HOME, TARGET, ease(seg(t, T.move0, T.move1))) + (TARGET - HOME) * -ease(seg(t, T.back0, T.back1));
  const Lc = t => lerp(40, 111, ease(seg(t, T.down0, T.down1))) - 71 * ease(seg(t, T.up0, T.up1));
  const A = t => {
    if (t < T.down0) return .35;
    if (t < T.close0) return lerp(.35, 1, easeOut(seg(t, T.down0, T.down0 + .5)));
    if (t < T.release) return lerp(1, .1, ease(seg(t, T.close0, T.close1)));
    return lerp(.1, 1, easeOut(seg(t, T.release, T.release + .3)));
  };
  // Swing: integrate a damped pendulum hanging from the moving carriage.
  function swing(t) {
    const dt = 1 / 240; let phi = 0, w = 0;
    for (let s = 0; s < t; s += dt) {
      const ax = (X(s + dt) - 2 * X(s) + X(s - dt)) / (dt * dt);
      const len = Lc(s) + 6;
      w += (-(1500 / len) * Math.sin(phi) - (ax / len) * Math.cos(phi) - 2.4 * w) * dt;
      phi += w * dt;
    }
    return phi;
  }
  function clawHead(pen, a) {
    pen.stroke([[-11, -7], [11, -7], [15, 8], [-15, 8]], { closed: true, fill: BG });
    pen.circle(0, -11, 4, { fill: BG });
    [-1, 1].forEach(s => pen.stroke([[s * 11, 8], [s * (17 + 15 * a), 24], [s * (13 + 13 * a), 40], [s * (3 + 9 * a), 47]], { w: 2.4, step: 8 }));
    pen.stroke([[0, 8], [0, 18]], { w: 2, amp: .4 });
  }
  function draw(pen, t, opts) {
    const c = pen.ctx, reveal = seg(t, T.slip0 - .2, T.slip0 + .4);
    const x = X(t), len = Lc(t), phi = swing(t), a = A(t);
    const hx = x + Math.sin(phi) * len, hy = CARRIAGE + Math.cos(phi) * len + 6;
    c.save(); c.globalAlpha *= lerp(1, .26, reveal);
    ground(pen, 470, 20, 340);
    // cabinet legs, lower cabinet
    pen.stroke([[52, 448], [52, 470]]); pen.stroke([[308, 448], [308, 470]]);
    pen.stroke([[40, 330], [320, 330], [320, 448], [40, 448]], { closed: true });
    // marquee with chasing bulbs
    pen.stroke([[34, 16], [326, 16], [326, 64], [34, 64]], { closed: true });
    pen.text('POETRY, PLEASE', 180, 41, { font: '400 22px Georgia, serif', ls: 1.2 });
    const chase = Math.floor(t * 4) % 2;
    for (let i = 0; i < 15; i++) pen.circle(48 + i * 18.9, 9, 2.8, { fill: (i % 2) === chase ? INK : BG, w: 1.4 });
    // glass box
    pen.stroke([[40, 70], [320, 70], [320, 330], [40, 330]], { closed: true });
    pen.stroke([[290, 104], [306, 88]], { w: 1.4 }); pen.stroke([[296, 116], [308, 104]], { w: 1.4 });
    // prize chute well
    pen.stroke([[122, 330], [122, 262], [44, 262]], { w: 2 });
    pen.stroke([[60, 262], [60, 250]], { w: 1.4 }); pen.stroke([[106, 262], [106, 250]], { w: 1.4 });
    pen.text('PRIZE', 82, 296, { ls: 2, font: '700 9px system-ui, sans-serif' });
    // pile
    pile.forEach(p => capsule(pen, p.x, p.y, R, p.rot));
    // rail, carriage, cable
    pen.stroke([[48, RAIL], [312, RAIL]], { w: 1.6 });
    pen.stroke([[48, RAIL + 4], [312, RAIL + 4]], { w: 1.2 });
    pen.stroke([[x - 14, 82], [x + 14, 82], [x + 14, CARRIAGE], [x - 14, CARRIAGE]], { closed: true, fill: BG });
    pen.stroke([[x, CARRIAGE], [hx, hy - 15]], { w: 1.5, amp: .5, step: 20 });
    // prize capsule
    const held = t >= T.close1 - .1 && t < T.release;
    let px = prize.x, py = prize.y, prot = prize.rot, showPrize = true;
    if (held) { px = hx + Math.sin(-phi) * -30; py = hy + Math.cos(phi) * 30 - 2; prot = prize.rot - phi; }
    else if (t >= T.release) {
      const relX = HOME + Math.sin(swing(T.release)) * 40, relY = CARRIAGE + 6 + 40 + 30;
      const u = seg(t, T.release, T.fall1);
      px = lerp(relX, 82, u); py = relY + easeIn(u) * 200; prot = prize.rot + u * 2;
      if (py > 345 - R) showPrize = false;
    }
    if (showPrize) { c.save(); c.beginPath(); c.rect(40, 70, 280, 260); c.clip(); capsule(pen, px, py, R, prot); c.restore(); }
    // claw
    c.save(); c.translate(hx, hy); c.rotate(-phi); clawHead(pen, a); c.restore();
    // controls
    const v = (X(t + .05) - X(t - .05)) / .1;
    const tilt = clamp(v / 140, -1, 1) * .45;
    pen.stroke(arcPts(232, 388, 18, 6, 0, TAU, 14), { closed: true, step: 1e9 });
    const tx = 232 + Math.sin(tilt) * 30, ty = 388 - Math.cos(tilt) * 30;
    pen.stroke([[232, 388], [tx, ty]], { w: 3, amp: .4 });
    pen.circle(tx, ty, 7.5, { fill: BG });
    const press = t > T.down0 - .15 && t < T.down0 + .2;
    pen.circle(285, 382, 14, { w: 1.6 });
    pen.circle(285, 382, press ? 7 : 9.5, { fill: press ? INK : BG });
    pen.text('1 PLAY · 1 POEM', 258, 428, { ls: 1.6, font: '700 9px system-ui, sans-serif' });
    // prize door: the flap tips outward as the capsule arrives
    const flap = Math.sin(Math.PI * seg(t, T.door0, T.out1)) ;
    pen.stroke([[54, 362], [116, 362], [116, 432], [54, 432]], { closed: true });
    pen.stroke([[60, 368], [110, 368], [110 + flap * 6, lerp(426, 382, flap)], [60 - flap * 6, lerp(426, 382, flap)]], { closed: true, fill: BG, w: 1.6 });
    pen.text('PUSH', 85, 350, { ls: 2, font: '700 9px system-ui, sans-serif' });
    c.restore();

    if (t >= T.out0) {
      const u = seg(t, T.out0, T.out1), d = easeOut(u);
      const bx = lerp(85, 190, d), arcY = -Math.sin(Math.min(1, u * 1.6) * Math.PI) * 22;
      const bounce = u > .62 ? Math.abs(Math.sin((u - .62) / .38 * Math.PI)) * 6 * (1 - u) : 0;
      const by = lerp(400, 455, clamp(u * 1.6)) + arcY - bounce;
      c.save(); c.globalAlpha *= lerp(1, .55, reveal);
      capsule(pen, bx, by, R, prize.rot + d * 6, easeOut(seg(t, T.open0, T.open0 + .35)));
      c.restore();
      slip(pen, t, T.slip0, [bx, by - 10], opts.poem, opts.ticket);
    }
  }
  return { draw, duration: T.end, fade: T.fade, still: 11.5 };
})();


/* ---------------- Typewriter ---------------- */
// The poem is typed onto a sheet a key at a time; the bell rings at each line
// end, then the sheet is pulled out and becomes the slip.
const typewriter = (() => {
  const CPS = 15, RETURN = .42, START = .9, CW = 9.2, LEFT = 62, TYPE_Y = 234, PLATEN = 262;
  const FONT = '15px "Courier New", Courier, monospace';
  function plan(poem) {
    const lines = [...poem.lines, '— ' + poem.by];
    const starts = []; let at = START;
    lines.forEach(line => { starts.push(at); at += line.length / CPS + RETURN; });
    return { lines, starts, done: at };
  }
  const timing = opts => { const d = plan(opts.poem).done; return { slipAt: d + .7, endAt: d + .7 + 2.4 }; };
  function keyboard(pen, pressed) {
    [[334, 80, 10], [357, 91, 9], [380, 102, 8]].forEach(([y, x0, n], r) => {
      for (let i = 0; i < n; i++) {
        const down = pressed === r * 10 + i;
        pen.circle(x0 + i * 22, y + (down ? 2 : 0), down ? 6 : 7.5, { fill: down ? INK : BG, w: 1.6 });
      }
    });
    pen.stroke([[128, 398], [232, 398], [232, 406], [128, 406]], { closed: true, fill: BG, w: 1.6 });
  }
  function draw(pen, t, opts) {
    const c = pen.ctx, { lines, starts, done } = plan(opts.poem), T = timing(opts);
    const reveal = seg(t, T.slipAt - .2, T.slipAt + .4);
    // where the typing is: line index and characters shown on each line
    let cur = 0;
    for (let i = 0; i < lines.length; i++) if (t >= starts[i]) cur = i;
    const shown = lines.map((line, i) => t < starts[i] ? 0 : Math.min(line.length, Math.floor((t - starts[i]) * CPS)));
    const typing = t >= START && t < done && shown[cur] < lines[cur].length;
    const col = shown[cur];
    // the carriage slides left a little as a line is typed, then snaps back
    const lineEnd = starts[cur] + lines[cur].length / CPS;
    const back = seg(t, lineEnd + .05, lineEnd + RETURN - .05);
    const shift = t < START ? 0 : -lerp(col, 0, cur < lines.length - 1 ? easeOut(back) : 0) * CW * .1;
    // the sheet rolls up one line on each return
    const roll = cur + (cur < lines.length - 1 ? easeOut(back) : 0);
    const feed = easeOut(seg(t, 0, START));
    const pull = easeIn(seg(t, done + .2, T.slipAt));
    const top = lerp(PLATEN, TYPE_Y - 50, feed) - roll * 24 - pull * 70;

    c.save(); c.globalAlpha *= lerp(1, .26, reveal);
    ground(pen, 420, 18, 342);
    // sheet (behind the platen), with what has been typed so far
    if (pull < 1) {
      c.save(); c.beginPath(); c.rect(0, 0, W, PLATEN); c.clip();
      c.translate(shift, 0);
      const bottom = Math.max(top + 10, PLATEN + 4);
      pen.stroke([[40, top], [320, top], [320, bottom], [40, bottom]], { closed: true, fill: BG });
      pen.text('POETRY, PLEASE · No. ' + String(opts.ticket).padStart(4, '0'), LEFT, top + 18, { align: 'left', ls: 1.4, font: '700 8px system-ui, sans-serif' });
      lines.forEach((line, i) => {
        if (!shown[i]) return;
        pen.text(line.slice(0, shown[i]), LEFT, top + 50 + i * 24, { align: 'left', font: FONT });
      });
      c.restore();
    }
    // platen roller, knobs and return lever
    c.save(); c.translate(shift, 0);
    pen.stroke([[52, PLATEN - 8], [308, PLATEN - 8], [308, PLATEN + 12], [52, PLATEN + 12]], { closed: true, fill: BG });
    pen.circle(42, PLATEN + 2, 11, { fill: BG }); pen.circle(318, PLATEN + 2, 11, { fill: BG });
    pen.stroke([[40, PLATEN - 9], [22, PLATEN - 30], [12, PLATEN - 30]], { w: 2.4 });
    c.restore();
    // body, type basket, keys
    pen.stroke([[66, 280], [294, 280], [334, 412], [26, 412]], { closed: true, fill: BG });
    pen.stroke(arcPts(180, 300, 46, 18, Math.PI, TAU, 12), { w: 1.6, step: 1e9 });
    for (let i = 0; i < 9; i++) { const a = Math.PI + (i + .5) * Math.PI / 9; pen.stroke([[180, 300], [180 + Math.cos(a) * 40, 300 + Math.sin(a) * 15]], { w: 1, amp: .4 }); }
    let pressed = -1;
    if (typing) {
      const k = (t - starts[cur]) * CPS;
      const ch = lines[cur][Math.floor(k)] || ' ';
      if (k % 1 < .55 && ch !== ' ') {
        pressed = (ch.charCodeAt(0) * 7) % 27;
        pen.stroke([[180, 300], [180, TYPE_Y + 8]], { w: 2.6, amp: .3 });
      }
    }
    keyboard(pen, pressed);
    pen.text('POETRY, PLEASE', 180, 316, { ls: 2, font: '700 8px system-ui, sans-serif' });
    // bell at the end of each line
    if (t >= lineEnd && t < lineEnd + .35 && cur < lines.length - 1) pen.text('ding!', 330, PLATEN - 40, { font: 'italic 15px Georgia, serif' });
    c.restore();

    slip(pen, t, T.slipAt - .25, [180, top + 70], opts.poem, opts.ticket, { instant: true, font: FONT, size: [280, 150] });
  }
  return { draw, timing, speed: 1 };
})();

/* ---------------- Mimeograph ---------------- */
// A hand-cranked stencil duplicator: the drum turns, a sheet feeds under it and
// slides out printed, then lifts off the tray as the slip.
const press = (() => {
  const D = { x: 128, y: 176, r: 58 }, SHEET = { w: 128, h: 92, y: 268 }, EXIT = 214, LIFT = -36;
  const T = { crank0: .6, crank1: 3.0, feed0: 1.0, feed1: 2.9, slipAt: 3.6 };
  const timing = () => ({ slipAt: T.slipAt, endAt: T.slipAt + 3 });
  function draw(pen, t, opts) {
    const c = pen.ctx, reveal = seg(t, T.slipAt - .2, T.slipAt + .4);
    const spin = ease(seg(t, T.crank0, T.crank1)) * TAU * 2;
    const mid = (T.feed0 + T.feed1) / 2;
    const first = ease(seg(t, T.feed0, mid)), second = ease(seg(t, mid, T.feed1));
    const sx = lerp(EXIT - SHEET.w - 10, EXIT + 8, second);
    c.save(); c.globalAlpha *= lerp(1, .26, reveal);
    c.save(); c.translate(0, LIFT);
    ground(pen, 404, 14, 346);
    // stand and legs
    pen.stroke([[52, 372], [52, 404]]); pen.stroke([[204, 372], [204, 404]]);
    // feed table with a stack of blank sheets
    for (let i = 0; i < 5; i++) pen.stroke([[20, 238 - i * 4], [74, 222 - i * 4]], { w: 1.4, amp: .5 });
    pen.stroke([[16, 244], [80, 226]], { w: 2 });
    // body
    pen.stroke([[44, 232], [212, 232], [212, 372], [44, 372]], { closed: true, fill: BG });
    pen.text('MIMEOGRAPH', 128, 300, { ls: 2.4, font: '700 9px system-ui, sans-serif' });
    pen.text('POETRY, PLEASE', 128, 318, { ls: 1.6, font: '700 8px system-ui, sans-serif' });
    pen.stroke([[62, 344], [194, 344]], { w: 1.2 });
    // output tray and the printed sheet
    pen.stroke([[EXIT, 368], [350, 360]], { w: 2 });
    c.save(); c.beginPath(); c.rect(EXIT, 0, W - EXIT, H); c.clip();
    const rows = [...opts.poem.lines, opts.poem.by];
    const sheet = (x, y) => {
      pen.stroke([[x, y], [x + SHEET.w, y - 4], [x + SHEET.w, y + SHEET.h - 4], [x, y + SHEET.h]], { closed: true, fill: BG, w: 1.8 });
      rows.forEach((line, i) => {
        const len = Math.min(SHEET.w - 30, line.length * 3.8);
        pen.stroke([[x + 14, y + 22 + i * 14], [x + 14 + len, y + 21 + i * 14]], { w: i === rows.length - 1 ? 1 : 2, amp: .5 });
      });
    };
    // two copies come off the drum; the second lands on the first
    sheet(lerp(EXIT - SHEET.w - 10, EXIT + 14, first), SHEET.y + 6);
    if (second > 0) sheet(sx, SHEET.y);
    c.restore();
    // drum with ink stripes, hub and crank
    pen.circle(D.x, D.y, D.r, { fill: BG, w: 2.2 });
    for (let i = 0; i < 6; i++) {
      const a = spin + i * TAU / 6;
      pen.stroke(arcPts(D.x, D.y, D.r - 9, D.r - 9, a, a + .45, 4), { w: 1.2, step: 1e9, amp: .4 });
    }
    pen.circle(D.x, D.y, 9, { fill: INK });
    const kx = D.x + Math.cos(spin + Math.PI) * 74, ky = D.y + Math.sin(spin + Math.PI) * 74;
    pen.stroke([[D.x, D.y], [kx, ky]], { w: 3, amp: .4 });
    pen.circle(kx, ky, 7, { fill: BG });
    if (t > T.crank0 && t < T.crank1) {
      pen.stroke(arcPts(D.x, D.y, D.r + 10, D.r + 10, -1.1, -.6, 4), { w: 1.2, step: 1e9 });
      pen.stroke(arcPts(D.x, D.y, D.r + 16, D.r + 16, -1.0, -.75, 3), { w: 1.2, step: 1e9 });
    }
    c.restore();
    c.restore();
    slip(pen, t, T.slipAt - .25, [sx + SHEET.w / 2, SHEET.y + LIFT + SHEET.h / 2], opts.poem, opts.ticket, { instant: true, size: [SHEET.w, SHEET.h] });
  }
  return { draw, timing, speed: 1 };
})();

const SLIP_CPS = 34;
const typedTiming = slipAt => opts => {
  const chars = opts.poem.lines.join('').length + opts.poem.lines.length * 3;
  return { slipAt, endAt: slipAt + .85 + chars / SLIP_CPS + 1.6 };
};
const SCENES = {
  dispenser: { scene: gumball, speed: 1.35, timing: typedTiming(5.6) },
  claw: { scene: claw, speed: 1.7, timing: typedTiming(8.75) },
  typewriter: { scene: typewriter, speed: 1, timing: typewriter.timing },
  press: { scene: press, speed: 1, timing: press.timing },
};
export const INTRO_ART = Object.keys(SCENES);

// Plays one intro on the canvas. onSlip fires when the poem slip opens and
// onEnd when the slip has been read for a moment. Returns stop().
export function playIntro(canvas, variant, { poem, ticket = 1, onSlip, onEnd } = {}) {
  const { scene, speed, timing } = SCENES[variant];
  const ctx = canvas.getContext('2d'), pen = new Pen(ctx);
  const opts = { poem, ticket };
  const { slipAt, endAt } = timing(opts);
  let start = null, raf = 0, key = '', slipped = false, ended = false;
  function size() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), w = canvas.clientWidth || 260;
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(w * dpr * H / W); key = '';
  }
  function frame(now) {
    if (start === null) start = now;
    const t = Math.min(endAt, (now - start) / 1000 * speed);
    const tq = Math.floor(t * 12) / 12, boil = Math.floor(now / 125);
    const k = tq + '|' + boil;
    if (k !== key) {
      key = k;
      const s = canvas.width / W;
      ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1;
      ctx.fillStyle = BG; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.setTransform(s, 0, 0, s, 0, 0); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalAlpha = seg(tq, 0, .35);
      pen.begin(boil, true);
      scene.draw(pen, tq, opts);
    }
    if (!slipped && t >= slipAt) { slipped = true; onSlip?.(); }
    if (!ended && t >= endAt) { ended = true; onEnd?.(); }
    raf = requestAnimationFrame(frame);
  }
  size();
  addEventListener('resize', size);
  raf = requestAnimationFrame(frame);
  return () => { cancelAnimationFrame(raf); removeEventListener('resize', size); };
}
