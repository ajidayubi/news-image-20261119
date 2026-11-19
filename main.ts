// The World in One Day - 19 November 2026
// A procedural newspaper front page, drawn pixel by pixel from fixed
// constants. No network, no files read at runtime, no randomness:
// the same run always writes the same PNG bytes.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// Palette: cream paper, near-black ink, red accent, muted panel colours.
const PAPER: [number, number, number] = [250, 244, 230];
const CARD: [number, number, number] = [255, 253, 246];
const INK: [number, number, number] = [22, 22, 26];
const RED: [number, number, number] = [178, 34, 34];
const DARK: [number, number, number] = [26, 30, 40];
const WHITE: [number, number, number] = [255, 255, 255];
const BLUE: [number, number, number] = [72, 102, 138];
const GREEN: [number, number, number] = [84, 128, 96];
const GOLD: [number, number, number] = [176, 138, 62];
const SLATE: [number, number, number] = [96, 104, 116];
const SKY: [number, number, number] = [214, 228, 238];

type RGB = [number, number, number];

// ---------------------------------------------------------------- canvas
class Canvas {
  buf: Uint8Array;
  constructor() {
    this.buf = new Uint8Array(W * H * 3);
    this.fill(PAPER);
  }
  fill(c: RGB): void {
    for (let i = 0; i < W * H; i++) {
      this.buf[i * 3] = c[0];
      this.buf[i * 3 + 1] = c[1];
      this.buf[i * 3 + 2] = c[2];
    }
  }
  px(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.buf[i] = c[0];
    this.buf[i + 1] = c[1];
    this.buf[i + 2] = c[2];
  }
  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    for (let yy = y; yy < y + h; yy++) {
      for (let xx = x; xx < x + w; xx++) this.px(xx, yy, c);
    }
  }
  frame(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
    this.rect(x, y, w, t, c);
    this.rect(x, y + h - t, w, t, c);
    this.rect(x, y, t, h, c);
    this.rect(x + w - t, y, t, h, c);
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));
    if (steps === 0) {
      this.px(x0, y0, c);
      return;
    }
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + (dx * s) / steps);
      const y = Math.round(y0 + (dy * s) / steps);
      this.px(x, y, c);
      this.px(x + 1, y, c);
    }
  }
  circle(cx: number, cy: number, r: number, c: RGB): void {
    for (let yy = cy - r; yy <= cy + r; yy++) {
      for (let xx = cx - r; xx <= cx + r; xx++) {
        const dx = xx - cx;
        const dy = yy - cy;
        if (dx * dx + dy * dy <= r * r) this.px(xx, yy, c);
      }
    }
  }
  ring(cx: number, cy: number, r: number, c: RGB): void {
    for (let a = 0; a < 360; a += 2) {
      const rad = (a * 3.14159265) / 180;
      this.px(cx + Math.round(Math.cos(rad) * r), cy + Math.round(Math.sin(rad) * r), c);
      this.px(cx + Math.round(Math.cos(rad) * (r - 1)), cy + Math.round(Math.sin(rad) * (r - 1)), c);
    }
  }
  tri(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minX = Math.min(x0, x1, x2);
    const maxX = Math.max(x0, x1, x2);
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    const d = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
    if (d === 0) return;
    for (let yy = minY; yy <= maxY; yy++) {
      for (let xx = minX; xx <= maxX; xx++) {
        const a = ((x1 - xx) * (y2 - yy) - (y1 - yy) * (x2 - xx)) / d;
        const b = ((x2 - xx) * (y0 - yy) - (y2 - yy) * (x0 - xx)) / d;
        const cc = 1 - a - b;
        if (a >= 0 && b >= 0 && cc >= 0) this.px(xx, yy, c);
      }
    }
  }
}

// ------------------------------------------------------------------- font
// A small 5x7 bitmap font, written out glyph by glyph. Each glyph is
// seven rows of five cells; "#" is ink, "." is empty.
const GLYPHS: Record<string, string[]> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "•": ["00000", "00000", "01100", "01100", "00000", "00000", "00000"],
  "€": ["00111", "01000", "10000", "11110", "10000", "01000", "00111"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
};

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale - scale;
}

function drawText(cv: Canvas, s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = x;
  // The bitmap font holds uppercase glyphs only, so normalise here:
  // sentence-case summaries would otherwise lose every lowercase letter.
  for (const ch of s.toUpperCase()) {
    if (ch === " ") {
      cx += 6 * scale;
      continue;
    }
    const g = GLYPHS[ch];
    if (!g) {
      cx += 6 * scale;
      continue;
    }
    for (let r = 0; r < 7; r++) {
      for (let col = 0; col < 5; col++) {
        if (g[r][col] === "1") {
          cv.rect(cx + col * scale, y + r * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawCentered(cv: Canvas, s: string, y: number, scale: number, c: RGB, x0 = 0, x1 = W): void {
  const w = textWidth(s, scale);
  drawText(cv, s, x0 + Math.floor((x1 - x0 - w) / 2), y, scale, c);
}

// Greedy word wrap: returns lines that fit inside maxWidth pixels.
function wrap(s: string, scale: number, maxWidth: number): string[] {
  const words = s.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const trial = cur === "" ? word : cur + " " + word;
    if (textWidth(trial, scale) <= maxWidth || cur === "") {
      cur = trial;
    } else {
      lines.push(cur);
      cur = word;
    }
  }
  if (cur !== "") lines.push(cur);
  return lines;
}

// --------------------------------------------------------------------- PNG
const CRC_TABLE: number[] = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function encodePNG(cv: Canvas): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(cv.buf.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// -------------------------------------------------------------- pictograms
// Each panel gets a small picture drawn from rectangles, lines, circles
// and triangles, keyed by its index in the grid (0 = Crimea bridge, ...).
function pictogram(cv: Canvas, x: number, y: number, idx: number): void {
  const cx = x + 38;
  const cy = y + 38;
  cv.frame(x, y, 76, 76, INK, 2);
  cv.rect(x + 2, y + 2, 72, 72, SKY);
  if (idx === 0) {
    // Bridge: two towers, a deck, a broken span and a crack.
    cv.rect(x + 12, y + 30, 6, 34, INK);
    cv.rect(x + 58, y + 30, 6, 34, INK);
    cv.rect(x + 8, y + 52, 60, 5, INK);
    cv.line(x + 15, y + 30, cx, y + 52, RED);
    cv.line(x + 61, y + 30, cx, y + 52, RED);
    cv.line(cx - 4, y + 52, cx + 6, y + 44, RED);
    cv.line(cx + 6, y + 44, cx - 2, y + 38, RED);
    cv.circle(cx, y + 20, 5, GOLD);
  } else if (idx === 1) {
    // Missiles crossing: two triangles with flame tails and burst stars.
    cv.tri(cx - 26, cy - 6, cx - 8, cy, cx - 26, cy + 6, RED);
    cv.line(cx - 26, cy, cx - 34, cy, GOLD);
    cv.tri(cx + 26, cy - 14, cx + 8, cy - 8, cx + 26, cy - 2, BLUE);
    cv.line(cx + 26, cy - 8, cx + 34, cy - 8, GOLD);
    cv.circle(cx, cy + 18, 6, GOLD);
    cv.line(cx - 8, cy + 18, cx + 8, cy + 18, INK);
    cv.line(cx, cy + 10, cx, cy + 26, INK);
  } else if (idx === 2) {
    // Chip: a square die with pins and a halt cross.
    cv.rect(cx - 18, cy - 18, 36, 36, DARK);
    cv.rect(cx - 10, cy - 10, 20, 20, GREEN);
    for (let i = 0; i < 3; i++) {
      cv.rect(cx - 24, cy - 14 + i * 12, 6, 4, INK);
      cv.rect(cx + 18, cy - 14 + i * 12, 6, 4, INK);
      cv.rect(cx - 14 + i * 12, cy - 24, 4, 6, INK);
      cv.rect(cx - 14 + i * 12, cy + 18, 4, 6, INK);
    }
    cv.line(cx - 10, cy - 10, cx + 10, cy + 10, RED);
    cv.line(cx + 10, cy - 10, cx - 10, cy + 10, RED);
  } else if (idx === 3) {
    // Framed painting: gold frame, sun and hills, a price tag.
    cv.rect(cx - 24, cy - 20, 48, 40, GOLD);
    cv.rect(cx - 19, cy - 15, 38, 30, BLUE);
    cv.circle(cx - 8, cy - 6, 6, GOLD);
    cv.tri(cx - 19, cy + 15, cx - 2, cy - 2, cx + 14, cy + 15, GREEN);
    cv.tri(cx - 2, cy + 15, cx + 12, cy + 2, cx + 19, cy + 15, GREEN);
    cv.rect(cx + 8, cy + 18, 22, 12, WHITE);
    cv.line(cx + 8, cy + 18, cx + 30, cy + 18, INK);
  } else if (idx === 4) {
    // Rising chart: three bars and an arrow climbing.
    cv.rect(cx - 24, cy + 8, 10, 16, BLUE);
    cv.rect(cx - 8, cy - 2, 10, 26, GREEN);
    cv.rect(cx + 8, cy - 14, 10, 38, GOLD);
    cv.line(cx - 26, cy - 16, cx + 26, cy - 22, RED);
    cv.tri(cx + 26, cy - 22, cx + 16, cy - 22, cx + 26, cy - 12, RED);
  } else if (idx === 5) {
    // Scales of justice: a beam, two pans, a pillar.
    cv.rect(cx - 3, cy - 22, 6, 46, INK);
    cv.rect(cx - 26, cy - 22, 52, 4, INK);
    cv.line(cx - 24, cy - 18, cx - 24, cy - 2, INK);
    cv.line(cx + 24, cy - 18, cx + 24, cy - 2, INK);
    cv.tri(cx - 32, cy - 2, cx - 16, cy - 2, cx - 24, cy + 12, GOLD);
    cv.tri(cx + 16, cy - 2, cx + 32, cy - 2, cx + 24, cy + 12, GOLD);
    cv.rect(cx - 14, cy + 24, 28, 4, INK);
  } else if (idx === 6) {
    // Tank: hull, turret, barrel and wheels.
    cv.rect(cx - 26, cy - 2, 48, 16, DARK);
    cv.rect(cx - 12, cy - 14, 24, 12, DARK);
    cv.line(cx + 12, cy - 10, cx + 32, cy - 14, INK);
    cv.line(cx + 12, cy - 8, cx + 32, cy - 12, INK);
    cv.circle(cx - 18, cy + 18, 5, INK);
    cv.circle(cx, cy + 18, 5, INK);
    cv.circle(cx + 18, cy + 18, 5, INK);
    cv.line(cx - 28, cy - 20, cx - 20, cy - 28, RED);
    cv.line(cx - 20, cy - 28, cx - 12, cy - 20, RED);
  } else {
    // Euro coin: a ringed coin with a big euro mark drawn as bars.
    cv.circle(cx, cy, 24, GOLD);
    cv.ring(cx, cy, 24, INK);
    cv.circle(cx, cy, 17, CARD);
    cv.rect(cx - 10, cy - 8, 16, 4, INK);
    cv.rect(cx - 10, cy - 1, 16, 4, INK);
    cv.rect(cx - 10, cy + 6, 12, 4, INK);
    cv.line(cx - 8, cy - 12, cx - 8, cy + 12, INK);
  }
}

function flag(cv: Canvas, x: number, y: number, stripes: RGB[]): void {
  // A pole with a flag of three vertical stripes.
  cv.rect(x, y, 3, 62, INK);
  for (let i = 0; i < 3; i++) {
    cv.rect(x + 3 + i * 13, y, 13, 26, stripes[i]);
  }
  cv.frame(x + 3, y, 39, 26, INK, 1);
}

// ------------------------------------------------------------------ layout
const PANEL_COLORS: RGB[] = [RED, BLUE, DARK, GREEN, GOLD, SLATE, RED, BLUE];

interface Story {
  headline: string;
  summary: string;
}

const GRID: Story[] = [
  { headline: "CRIMEA BRIDGE HIT AGAIN", summary: "Traffic closed as damage is assessed after another attack." },
  { headline: "U.S. AND IRAN TRADE FIRE ACROSS THE GULF", summary: "U.S. struck a missile site on Qeshm Island; Iran hit a U.S. base in Kuwait and struck Bahrain again." },
  { headline: "NVIDIA HALTS CHINA CHIP SHIPMENTS", summary: "Acting CEO Colette Kress promises earlier pay rises; H-series halted." },
  { headline: "VAN GOGH SELLS FOR $190.4M", summary: "Record price after a row over its Nazi history." },
  { headline: "ANTHROPIC EYES $1.4 TRILLION DEBUT", summary: "The Claude-maker is poised for a giant stock market listing." },
  { headline: "MYANMAR FACES GENOCIDE VERDICT", summary: "The UN court rules on the Rohingya massacres." },
  { headline: "GAZA: TANKS CROSS CEASEFIRE LINE", summary: "Rare Israeli ground operation; rain displaces 46,000 households." },
  { headline: "EU PLANS €45BN UKRAINE LOAN", summary: "To be repaid after Russia pays reparations." },
];

const TICKER =
  "GTA VI ROLLS OUT WORLDWIDE • CYCLONE AKVAN NEARS INDIA • FED MINUTES POINT TO MORE HIKES • " +
  "PRAGUE MARCHES FOR FREE PRESS • VOYAGER 1 PASSES LIGHT-DAY • U.S. ANNOUNCES $2BN PHILIPPINES LOAN • " +
  "STACY KEACH DIES AT 85";

function main(): void {
  const cv = new Canvas();

  // Masthead: dark band, big title, red rule, dateline.
  cv.rect(0, 0, W, 96, DARK);
  drawCentered(cv, "THE WORLD IN ONE DAY", 28, 5, WHITE);
  cv.rect(0, 96, W, 6, RED);
  drawCentered(cv, "THURSDAY, 19 NOVEMBER 2026 • PRICE: ONE DAY'S NEWS", 116, 2, INK);

  // Lead story panel, full width.
  const leadX = 16;
  const leadY = 144;
  const leadW = 992;
  const leadH = 236;
  cv.rect(leadX, leadY, leadW, leadH, CARD);
  cv.frame(leadX, leadY, leadW, leadH, INK, 2);
  cv.rect(leadX + 2, leadY + 2, leadW - 4, 26, RED);
  drawText(cv, "LEAD STORY", leadX + 14, leadY + 9, 2, WHITE);
  drawText(cv, "TRUMP, XI AND PUTIN MEET IN SHENZHEN", leadX + 14, leadY + 40, 3, INK);
  drawText(cv, "First-ever trilateral at the APEC summit;", leadX + 14, leadY + 70, 2, INK);
  drawText(cv, "Xi hugged Trump on the tarmac.", leadX + 14, leadY + 90, 2, INK);

  // Skyline: towers of varying heights along the bottom of the lead.
  const base = leadY + leadH - 4;
  const heights = [52, 78, 44, 92, 62, 100, 48, 70, 88, 46, 96, 58];
  const towerW = 72;
  const gap = 8;
  for (let i = 0; i < heights.length; i++) {
    const tx = leadX + 16 + i * (towerW + gap);
    const th = heights[i];
    cv.rect(tx, base - th, towerW, th, i % 2 === 0 ? BLUE : SLATE);
    cv.rect(tx, base - th, towerW, 5, DARK);
    for (let wy = base - th + 12; wy < base - 10; wy += 16) {
      for (let wx = tx + 10; wx < tx + towerW - 10; wx += 16) {
        if ((wx + wy) % 32 === 0) cv.rect(wx, wy, 6, 8, CARD);
      }
    }
  }
  // Three flags on poles above the right-hand towers, three stripes each.
  // They sit clear of the headline and summary, which end well to the left.
  flag(cv, leadX + 16 + 9 * (towerW + gap) + 30, base - 46 - 62, [RED, WHITE, BLUE]);
  flag(cv, leadX + 16 + 10 * (towerW + gap) + 30, base - 96 - 62, [RED, GOLD, BLUE]);
  flag(cv, leadX + 16 + 11 * (towerW + gap) + 30, base - 58 - 62, [GREEN, WHITE, RED]);

  // Grid: 8 panels, 2 columns by 4 rows.
  const gridY = 396;
  const panelW = 488;
  const panelH = 128;
  for (let i = 0; i < GRID.length; i++) {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const px = 16 + col * (panelW + 16);
    const py = gridY + row * (panelH + 8);
    const story = GRID[i];
    cv.rect(px, py, panelW, panelH, CARD);
    cv.frame(px, py, panelW, panelH, INK, 2);
    cv.rect(px + 2, py + 2, panelW - 4, 10, PANEL_COLORS[i]);
    const textW = panelW - 24 - 92;
    const headLines = wrap(story.headline, 2, textW);
    let ty = py + 20;
    for (const line of headLines.slice(0, 2)) {
      drawText(cv, line, px + 12, ty, 2, INK);
      ty += 16;
    }
    const sumLines = wrap(story.summary, 1, textW);
    for (const line of sumLines.slice(0, 2)) {
      drawText(cv, line, px + 12, ty, 1, INK);
      ty += 10;
    }
    pictogram(cv, px + panelW - 92, py + 20, i);
  }

  // Ticker strip at the bottom.
  const tickY = 944;
  cv.rect(0, tickY, W, 64, DARK);
  cv.rect(0, tickY, W, 4, RED);
  const tickLines = wrap(TICKER, 1, W - 32);
  let ty2 = tickY + 14;
  for (const line of tickLines.slice(0, 2)) {
    drawCentered(cv, line, ty2, 1, WHITE);
    ty2 += 12;
  }

  const outDir = process.env.MAKEFUN_OUTPUT_DIR || "./out";
  fs.mkdirSync(outDir, { recursive: true });
  const png = encodePNG(cv);
  fs.writeFileSync(path.join(outDir, "entry.png"), png);
}

main();
