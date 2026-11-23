/*
 * Deterministically rebuilds the five Collection Room rarity panels from the
 * uploaded source artwork in attached_assets/.
 *
 * For each source panel:
 *  - header (emblem, laurels, title bar, top border) rows are copied verbatim,
 *    with the baked "0 / N" counter painted out by horizontal interpolation;
 *  - footer (bottom border + bottom corner ornaments) rows are copied verbatim;
 *  - the baked slot band (locked domes / pedestals / labels) is removed and
 *    replaced by a clean extended parchment interior whose side columns are
 *    taken from the original frame (top + bottom ornaments kept, mid rows
 *    continued from a clean frame row);
 *  - exactly one clean pedestal (cut below the locked dome, "???" text removed)
 *    is composited per dumpling slot. Each pedestal is extracted from the
 *    source panel's own middle pedestal so the rarity glow stays native.
 *
 * Outputs: assets/images/collection/<rarity>-panel.png and
 *          components/collection/panelGeometry.ts
 * Run: node scripts/build-collection-panels.js (from artifacts/word-hunt)
 */
const fs = require('fs');
const path = require('path');

function loadPng() {
  try {
    return require('pngjs').PNG;
  } catch {
    const root = path.resolve(__dirname, '../../../node_modules/.pnpm/pngjs@3.4.0/node_modules/pngjs');
    return require(root).PNG;
  }
}
const PNG = loadPng();

const APP = path.resolve(__dirname, '..');
const SRC_DIR = path.resolve(APP, '../../attached_assets');
const OUT_DIR = path.join(APP, 'assets/images/collection');
const GEOMETRY_FILE = path.join(APP, 'components/collection/panelGeometry.ts');

// Measured from the source PNGs (see report). d0/d1 bound the baked slot band.
// ped = middle pedestal crop (dome removed above y0; label bottom at y1).
const PANELS = {
  Legendary: { counterText: { x0: 408, x1: 460, y0: 39, y1: 60 }, file: 'legendary-panel_', d0: 100, d1: 204, ped: { x0: 200, x1: 304, y0: 160, y1: 202 }, rows: [2], scale: 1 },
  Epic: { counterText: { x0: 414, x1: 461, y0: 35, y1: 56 }, file: 'epic-panel_', d0: 91, d1: 323, ped: { x0: 202, x1: 310, y0: 153, y1: 197 }, rows: [4], scale: 0.86 },
  Rare: { counterText: { x0: 425, x1: 475, y0: 54, y1: 77 }, file: 'rare-panel_', d0: 116, d1: 231, ped: { x0: 206, x1: 319, y0: 179, y1: 229 }, rows: [3, 2], scale: 1 },
  Uncommon: { counterText: { x0: 424, x1: 475, y0: 44, y1: 66 }, file: 'uncommon-panel_', d0: 107, d1: 222, ped: { x0: 205, x1: 318, y0: 168, y1: 220 }, rows: [4, 3], scale: 0.86 },
  Common: { counterText: { x0: 417, x1: 477, y0: 39, y1: 61 }, file: 'common-panel_', d0: 98, d1: 213, ped: { x0: 204, x1: 317, y0: 161, y1: 211 }, rows: [4, 4, 4], scale: 0.86 },
};

const SIDE = 50; // frame side columns (border + corner ornaments)
const DUMPLING = 78; // dumpling box size before panel scale (source px)
const SEAT = 15; // how far the dumpling bottom sinks onto the pedestal top
const ROW_GAP = 10;
const PAD_TOP = 4;
const PAD_BOTTOM = 6;

const lum = (d, i) => 0.3 * d[i] + 0.59 * d[i + 1] + 0.11 * d[i + 2];

function px(img, x, y) {
  const i = (y * img.width + x) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}
function setPx(img, x, y, c) {
  const i = (y * img.width + x) * 4;
  img.data[i] = c[0]; img.data[i + 1] = c[1]; img.data[i + 2] = c[2]; img.data[i + 3] = c[3];
}
const mix = (a, b, t) => a.map((v, k) => Math.round(v * (1 - t) + b[k] * t));

// Paint out text inside box by interpolating each row between its outer columns.
function interpolateOut(img, box) {
  for (let y = box.y0; y <= box.y1; y++) {
    const L = px(img, box.x0 - 1, y);
    const R = px(img, box.x1 + 1, y);
    for (let x = box.x0; x <= box.x1; x++) {
      setPx(img, x, y, mix(L, R, (x - box.x0 + 1) / (box.x1 - box.x0 + 2)));
    }
  }
}

function bboxWhere(img, x0, x1, y0, y1, test) {
  let b = null;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    if (test((y * img.width + x) * 4)) {
      if (!b) b = { x0: x, x1: x, y0: y, y1: y };
      b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
      b.y0 = Math.min(b.y0, y); b.y1 = Math.max(b.y1, y);
    }
  }
  return b;
}

function rowCopy(img, y, x0, x1) {
  const r = [];
  for (let x = x0; x <= x1; x++) r.push(px(img, x, y));
  return r;
}
function blurRow(row, rad) {
  return row.map((_, i) => {
    const acc = [0, 0, 0, 0]; let n = 0;
    for (let k = Math.max(0, i - rad); k <= Math.min(row.length - 1, i + rad); k++) {
      for (let c = 0; c < 4; c++) acc[c] += row[k][c];
      n++;
    }
    return acc.map((v) => Math.round(v / n));
  });
}

function extractPedestal(src, p) {
  const w = p.x1 - p.x0 + 1, h = p.y1 - p.y0 + 1;
  const ped = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) setPx(ped, x, y, px(src, p.x0 + x, p.y0 + y));
  // Smooth the dome's contact shadow on the pedestal top: in the upper rows,
  // dark central spans are interpolated between the surrounding gold surface.
  const topRows = Math.round(h * 0.38);
  for (let y = 0; y < topRows; y++) {
    let a = -1, b = -1;
    for (let x = Math.round(w * 0.2); x < Math.round(w * 0.8); x++) {
      if (lum(ped.data, (y * w + x) * 4) < 150) { if (a < 0) a = x; b = x; }
    }
    if (a < 0) continue;
    const box = { x0: Math.max(1, a - 3), x1: Math.min(w - 2, b + 3), y0: y, y1: y };
    interpolateOut(ped, box);
  }
  // Remove the baked "???": dark glyph pixels in the label's lower area.
  const cx = Math.round(w / 2);
  const text = bboxWhere(ped, cx - 24, cx + 24, Math.round(h * 0.45), h - 3, (i) => lum(ped.data, i) < 110);
  let label = null;
  if (text) {
    const box = { x0: text.x0 - 2, x1: text.x1 + 2, y0: text.y0 - 1, y1: text.y1 + 1 };
    interpolateOut(ped, box);
    // Label plaque centred on the removed text (measured plaque ~70x22 source px).
    const ty = Math.round((text.y0 + text.y1) / 2);
    label = { x0: cx - 34, x1: cx + 34, y0: ty - 10, y1: ty + 10 };
  }
  return { ped, label };
}

function sampleBilinear(img, fx, fy) {
  const x0 = Math.max(0, Math.min(img.width - 1, Math.floor(fx)));
  const y0 = Math.max(0, Math.min(img.height - 1, Math.floor(fy)));
  const x1 = Math.min(img.width - 1, x0 + 1), y1 = Math.min(img.height - 1, y0 + 1);
  const tx = Math.min(1, Math.max(0, fx - x0)), ty = Math.min(1, Math.max(0, fy - y0));
  return mix(mix(px(img, x0, y0), px(img, x1, y0), tx), mix(px(img, x0, y1), px(img, x1, y1), tx), ty);
}

function composite(dst, src, ox, oy, scale, feather) {
  const w = Math.round(src.width * scale), h = Math.round(src.height * scale);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = ox + x, dy = oy + y;
    if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
    const s = sampleBilinear(src, (x + 0.5) / scale - 0.5, (y + 0.5) / scale - 0.5);
    const edge = Math.min(x + 1, y + 1, w - x, h - y);
    const t = Math.min(1, edge / feather) * (s[3] / 255);
    const d = px(dst, dx, dy);
    setPx(dst, dx, dy, [...mix(d.slice(0, 3), s.slice(0, 3), t), d[3]]);
  }
}

function build(rarity, cfg) {
  const file = fs.readdirSync(SRC_DIR).find((f) => f.startsWith(cfg.file) && f.endsWith('.png'));
  const src = PNG.sync.read(fs.readFileSync(path.join(SRC_DIR, file)));
  const W = src.width, H = src.height;
  const { d0, d1, scale } = cfg;

  // Counter text ("0 / N"): manually measured tight glyph+shadow boxes only,
  // so the header bar, border and corner outside the digits stay original.
  const t = cfg.counterText;
  const counterBox = { x0: t.x0 - 2, x1: t.x1 + 2, y0: t.y0 - 1, y1: t.y1 + 1 };
  interpolateOut(src, counterBox);

  const { ped, label } = extractPedestal(src, cfg.ped);
  const pw = Math.round(ped.width * scale), ph = Math.round(ped.height * scale);
  const dSize = Math.round(DUMPLING * scale);
  const seat = Math.round(SEAT * scale);
  const rowH = dSize - seat + ph + ROW_GAP;
  const F = PAD_TOP + cfg.rows.length * rowH - ROW_GAP + PAD_BOTTOM;
  const OH = d0 + F + (H - d1);
  const out = new PNG({ width: W, height: OH });
  out.data.fill(0);

  for (let y = 0; y < d0; y++) for (let x = 0; x < W; x++) setPx(out, x, y, px(src, x, y));
  for (let y = d1; y < H; y++) for (let x = 0; x < W; x++) setPx(out, x, d0 + F + (y - d1), px(src, x, y));

  // Extended interior
  const c0 = SIDE, c1 = W - SIDE - 1;
  const topRow = rowCopy(src, d0 - 1, c0, c1), botRow = rowCopy(src, d1, c0, c1);
  const topBlur = blurRow(topRow, 18), botBlur = blurRow(botRow, 18);
  const K = Math.min(28, Math.floor((d1 - d0) / 2), Math.floor(F / 2));
  const mid = Math.round((d0 + d1) / 2);
  for (let r = 0; r < F; r++) {
    const y = d0 + r;
    const t = F > 1 ? r / (F - 1) : 0;
    // side columns from the original frame
    let sy = mid;
    if (r < K) sy = d0 + r; else if (F - r <= K) sy = d1 - (F - r);
    for (let x = 0; x < W; x++) {
      if (x < c0 || x > c1) { setPx(out, x, y, px(src, x, sy)); continue; }
      const k = x - c0;
      let c = mix(topBlur[k], botBlur[k], t);
      if (r < 14) c = mix(topRow[k], c, r / 14);
      if (F - 1 - r < 14) c = mix(botRow[k], c, (F - 1 - r) / 14);
      // soften the seam with the side columns
      const edge = Math.min(k, c1 - x);
      if (edge < 8) c = mix(px(src, x, sy), c, edge / 8);
      setPx(out, x, y, c);
    }
  }

  // Slots
  const maxCols = Math.max(...cfg.rows, 3);
  const cell = (c1 - c0) / maxCols;
  const slots = [];
  let rowTop = d0 + PAD_TOP;
  cfg.rows.forEach((n) => {
    const pedTop = rowTop + dSize - seat;
    const span = n * cell;
    const start = c0 + ((c1 - c0) - span) / 2;
    for (let i = 0; i < n; i++) {
      const cx = Math.round(start + cell * (i + 0.5));
      const ox = cx - Math.round(pw / 2);
      composite(out, ped, ox, pedTop, scale, 6);
      slots.push({
        cx,
        dumplingTop: rowTop,
        dumplingSize: dSize,
        pedestalTop: pedTop,
        pedestalBottom: pedTop + ph,
        label: label && {
          x: ox + Math.round(label.x0 * scale),
          y: pedTop + Math.round(label.y0 * scale),
          w: Math.round((label.x1 - label.x0 + 1) * scale),
          h: Math.round((label.y1 - label.y0 + 1) * scale),
        },
      });
    }
    rowTop += rowH;
  });

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, `${rarity.toLowerCase()}-panel.png`), PNG.sync.write(out));
  return {
    width: W,
    height: OH,
    rows: cfg.rows,
    counter: { x: counterBox.x0, y: counterBox.y0, w: counterBox.x1 - counterBox.x0 + 1, h: counterBox.y1 - counterBox.y0 + 1 },
    slots,
  };
}

const geometry = {};
for (const [rarity, cfg] of Object.entries(PANELS)) geometry[rarity] = build(rarity, cfg);

const ts = `// AUTO-GENERATED by scripts/build-collection-panels.js. Do not edit by hand.
// All coordinates are in source pixels of the matching panel PNG.
import type { DumplingRarity } from '@/data/dumplings';

export type PanelSlotGeometry = {
  cx: number;
  dumplingTop: number;
  dumplingSize: number;
  pedestalTop: number;
  pedestalBottom: number;
  label: { x: number; y: number; w: number; h: number };
};

export type PanelGeometry = {
  width: number;
  height: number;
  rows: number[];
  counter: { x: number; y: number; w: number; h: number };
  slots: PanelSlotGeometry[];
};

export const PANEL_GEOMETRY: Record<DumplingRarity, PanelGeometry> = ${JSON.stringify(geometry, null, 2)};
`;
fs.mkdirSync(path.dirname(GEOMETRY_FILE), { recursive: true });
fs.writeFileSync(GEOMETRY_FILE, ts);
for (const [r, g] of Object.entries(geometry)) console.log(r, g.width, 'x', g.height, 'slots', g.slots.length, 'counter', JSON.stringify(g.counter), 'label', JSON.stringify(g.slots[0].label));
