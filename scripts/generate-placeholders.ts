import { createCanvas } from 'canvas';
import * as fs from 'fs';
import * as path from 'path';

const TILE_SIZE = 16;
const ASSETS_DIR = path.join(process.cwd(), 'src', 'client', 'assets');

// Ensure assets directory exists
fs.mkdirSync(ASSETS_DIR, { recursive: true });

// Helper: parse hex color to [r, g, b]
function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

// Helper: set a single pixel on a canvas context
function setPixel(
  ctx: ReturnType<typeof createCanvas>['getContext'],
  x: number,
  y: number,
  color: string
) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, 1, 1);
}

// Seeded pseudo-random number generator (Mulberry32) for deterministic output
function makeRng(seed: number) {
  let s = seed;
  return function () {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────────────────────
// tileset.png  (64 × 16 — 4 tiles of 16×16)
// ─────────────────────────────────────────────────────────────
function generateTileset() {
  const canvas = createCanvas(TILE_SIZE * 4, TILE_SIZE);
  const ctx = canvas.getContext('2d');

  // Tile 0 — Grass
  {
    const rng = makeRng(1);
    ctx.fillStyle = '#4a8c3f';
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 20; i++) {
      const x = Math.floor(rng() * TILE_SIZE);
      const y = Math.floor(rng() * TILE_SIZE);
      setPixel(ctx, x, y, '#3a7030');
    }
  }

  // Tile 1 — Path (dirt/tan)
  {
    const rng = makeRng(2);
    ctx.fillStyle = '#c4a663';
    ctx.fillRect(TILE_SIZE, 0, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 20; i++) {
      const x = TILE_SIZE + Math.floor(rng() * TILE_SIZE);
      const y = Math.floor(rng() * TILE_SIZE);
      setPixel(ctx, x, y, '#b09050');
    }
  }

  // Tile 2 — Rock (gray)
  {
    const rng = makeRng(3);
    ctx.fillStyle = '#808080';
    ctx.fillRect(TILE_SIZE * 2, 0, TILE_SIZE, TILE_SIZE);
    // Darker pixel clusters: draw 5 small 2×2 clusters
    for (let i = 0; i < 5; i++) {
      const cx = TILE_SIZE * 2 + Math.floor(rng() * (TILE_SIZE - 2));
      const cy = Math.floor(rng() * (TILE_SIZE - 2));
      ctx.fillStyle = '#606060';
      ctx.fillRect(cx, cy, 2, 2);
    }
  }

  // Tile 3 — Water (blue)
  {
    const rng = makeRng(4);
    ctx.fillStyle = '#3070c0';
    ctx.fillRect(TILE_SIZE * 3, 0, TILE_SIZE, TILE_SIZE);
    // Wave-like lighter pixels: two horizontal wave rows
    for (let row = 0; row < 2; row++) {
      const baseY = 4 + row * 6;
      for (let col = 0; col < TILE_SIZE; col++) {
        // sine-ish pattern: alternate every 3 pixels
        const waveY = baseY + (col % 3 === 0 ? -1 : 0);
        setPixel(ctx, TILE_SIZE * 3 + col, waveY, '#5090e0');
      }
    }
    // Scatter a few extra lighter pixels
    for (let i = 0; i < 8; i++) {
      const x = TILE_SIZE * 3 + Math.floor(rng() * TILE_SIZE);
      const y = Math.floor(rng() * TILE_SIZE);
      setPixel(ctx, x, y, '#5090e0');
    }
  }

  const out = fs.createWriteStream(path.join(ASSETS_DIR, 'tileset.png'));
  canvas.createPNGStream().pipe(out);
  out.on('finish', () => console.log('tileset.png written (64×16)'));
}

// ─────────────────────────────────────────────────────────────
// player.png  (128 × 16 — 8 frames in a single row)
// Frames: [down_1, down_2, up_1, up_2, left_1, left_2, right_1, right_2]
// ─────────────────────────────────────────────────────────────
function drawPlayerFrame(
  ctx: ReturnType<typeof createCanvas>['getContext'],
  ox: number,  // x offset (left edge of this 16×16 frame)
  oy: number,  // y offset (top edge)
  direction: 'down' | 'up' | 'left' | 'right',
  frame: 0 | 1   // 0 = left leg forward, 1 = right leg forward
) {
  const body = '#4060c0';   // blue body
  const skin = '#f0c890';   // skin tone
  const hair = '#503010';   // dark brown hair
  const leg  = '#304080';   // darker blue legs
  const shoe = '#202020';   // dark shoes

  // Clear frame area (transparent)
  ctx.clearRect(ox, oy, TILE_SIZE, TILE_SIZE);

  // All frames share the same front-facing silhouette; direction just shifts
  // small details (eyes, hair side). For placeholder quality this is fine.

  // ── Body (rows 5–11, cols 4–11) ──
  ctx.fillStyle = body;
  ctx.fillRect(ox + 4, oy + 5, 8, 7);

  // ── Head (rows 1–4, cols 4–11) ──
  ctx.fillStyle = skin;
  ctx.fillRect(ox + 4, oy + 1, 8, 5);

  // ── Hair top ──
  ctx.fillStyle = hair;
  ctx.fillRect(ox + 4, oy + 1, 8, 1);

  // ── Eyes — vary by direction ──
  if (direction === 'down') {
    ctx.fillStyle = '#000000';
    setPixel(ctx, ox + 5, oy + 3, '#000000');
    setPixel(ctx, ox + 10, oy + 3, '#000000');
  } else if (direction === 'up') {
    // No eyes visible (back of head — show hair)
    ctx.fillStyle = hair;
    ctx.fillRect(ox + 4, oy + 1, 8, 5);
  } else if (direction === 'left') {
    setPixel(ctx, ox + 5, oy + 3, '#000000');
  } else {
    setPixel(ctx, ox + 10, oy + 3, '#000000');
  }

  // ── Legs ── (rows 12–14)
  // frame 0: left leg forward (col 4–5), right leg back (col 9–10)
  // frame 1: right leg forward, left leg back
  ctx.fillStyle = leg;
  if (frame === 0) {
    ctx.fillRect(ox + 4, oy + 12, 3, 2);   // left leg forward (lower)
    ctx.fillRect(ox + 9, oy + 12, 3, 1);   // right leg back (higher)
  } else {
    ctx.fillRect(ox + 4, oy + 12, 3, 1);   // left leg back
    ctx.fillRect(ox + 9, oy + 12, 3, 2);   // right leg forward
  }

  // ── Shoes ──
  ctx.fillStyle = shoe;
  if (frame === 0) {
    ctx.fillRect(ox + 4, oy + 14, 3, 1);
    ctx.fillRect(ox + 9, oy + 13, 3, 1);
  } else {
    ctx.fillRect(ox + 4, oy + 13, 3, 1);
    ctx.fillRect(ox + 9, oy + 14, 3, 1);
  }
}

function generatePlayer() {
  // 8 frames in a row → 128 × 16
  const canvas = createCanvas(TILE_SIZE * 8, TILE_SIZE);
  const ctx = canvas.getContext('2d');

  const directions: Array<'down' | 'up' | 'left' | 'right'> = [
    'down', 'down', 'up', 'up', 'left', 'left', 'right', 'right',
  ];
  const frames: Array<0 | 1> = [0, 1, 0, 1, 0, 1, 0, 1];

  for (let i = 0; i < 8; i++) {
    drawPlayerFrame(ctx, i * TILE_SIZE, 0, directions[i], frames[i]);
  }

  const out = fs.createWriteStream(path.join(ASSETS_DIR, 'player.png'));
  canvas.createPNGStream().pipe(out);
  out.on('finish', () => console.log('player.png written (128×16)'));
}

// ─────────────────────────────────────────────────────────────
// events.png  (80 × 16 — 5 event frames of 16×16)
// ─────────────────────────────────────────────────────────────
function generateEvents() {
  const canvas = createCanvas(TILE_SIZE * 5, TILE_SIZE);
  const ctx = canvas.getContext('2d');

  // Frame 0 — Campfire: brown logs + orange/red flame
  {
    const ox = 0;
    // logs
    ctx.fillStyle = '#804020';
    ctx.fillRect(ox + 2, 11, 12, 3);
    ctx.fillRect(ox + 4, 10, 2, 2);
    ctx.fillRect(ox + 10, 10, 2, 2);
    // flame body
    ctx.fillStyle = '#e05020';
    ctx.fillRect(ox + 5, 5, 6, 6);
    // flame tip
    ctx.fillStyle = '#ff8000';
    ctx.fillRect(ox + 6, 3, 4, 3);
    ctx.fillRect(ox + 7, 1, 2, 3);
    // inner bright
    ctx.fillStyle = '#ffee00';
    ctx.fillRect(ox + 7, 6, 2, 3);
  }

  // Frame 1 — Blacksmith: gray anvil
  {
    const ox = TILE_SIZE;
    // anvil top
    ctx.fillStyle = '#909090';
    ctx.fillRect(ox + 2, 4, 12, 4);
    // horn (left)
    ctx.fillStyle = '#808080';
    ctx.fillRect(ox + 2, 5, 3, 2);
    // waist
    ctx.fillStyle = '#707070';
    ctx.fillRect(ox + 5, 8, 6, 2);
    // base
    ctx.fillStyle = '#909090';
    ctx.fillRect(ox + 3, 10, 10, 4);
    // highlight
    ctx.fillStyle = '#b0b0b0';
    ctx.fillRect(ox + 3, 4, 11, 1);
  }

  // Frame 2 — Small monster (slime): green blob
  {
    const ox = TILE_SIZE * 2;
    // body
    ctx.fillStyle = '#50a050';
    ctx.fillRect(ox + 3, 6, 10, 8);
    // rounded top
    ctx.fillRect(ox + 4, 4, 8, 3);
    ctx.fillRect(ox + 5, 3, 6, 2);
    // eyes
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 4, 7, 3, 3);
    ctx.fillRect(ox + 9, 7, 3, 3);
    ctx.fillStyle = '#000000';
    setPixel(ctx, ox + 5, 8, '#000000');
    setPixel(ctx, ox + 10, 8, '#000000');
    // highlight
    ctx.fillStyle = '#70c070';
    ctx.fillRect(ox + 5, 4, 3, 2);
  }

  // Frame 3 — Rare monster: red creature
  {
    const ox = TILE_SIZE * 3;
    // body
    ctx.fillStyle = '#c03030';
    ctx.fillRect(ox + 3, 5, 10, 9);
    // head
    ctx.fillRect(ox + 4, 2, 8, 5);
    // horns
    ctx.fillStyle = '#901010';
    ctx.fillRect(ox + 4, 1, 2, 3);
    ctx.fillRect(ox + 10, 1, 2, 3);
    // eyes
    ctx.fillStyle = '#ffee00';
    ctx.fillRect(ox + 5, 4, 2, 2);
    ctx.fillRect(ox + 9, 4, 2, 2);
    ctx.fillStyle = '#000000';
    setPixel(ctx, ox + 6, 5, '#000000');
    setPixel(ctx, ox + 10, 5, '#000000');
    // arms
    ctx.fillStyle = '#c03030';
    ctx.fillRect(ox + 1, 6, 3, 5);
    ctx.fillRect(ox + 12, 6, 3, 5);
    // claws
    ctx.fillStyle = '#901010';
    ctx.fillRect(ox + 1, 11, 3, 1);
    ctx.fillRect(ox + 12, 11, 3, 1);
  }

  // Frame 4 — Mystery/random: purple question mark
  {
    const ox = TILE_SIZE * 4;
    // background circle
    ctx.fillStyle = '#8040c0';
    ctx.fillRect(ox + 2, 2, 12, 12);
    // round top of "?"
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(ox + 5, 3, 6, 2);   // top bar
    ctx.fillRect(ox + 9, 5, 2, 3);   // right side down
    ctx.fillRect(ox + 6, 7, 4, 2);   // curve bottom / middle
    ctx.fillRect(ox + 6, 9, 2, 2);   // stem top
    // gap (no fill — leave background)
    // dot
    ctx.fillRect(ox + 6, 12, 2, 2);
    // border/shade
    ctx.fillStyle = '#6020a0';
    ctx.fillRect(ox + 2, 2, 12, 1);
    ctx.fillRect(ox + 2, 13, 12, 1);
    ctx.fillRect(ox + 2, 2, 1, 12);
    ctx.fillRect(ox + 13, 2, 1, 12);
  }

  const out = fs.createWriteStream(path.join(ASSETS_DIR, 'events.png'));
  canvas.createPNGStream().pipe(out);
  out.on('finish', () => console.log('events.png written (80×16)'));
}

// ─────────────────────────────────────────────────────────────
// Run all generators
// ─────────────────────────────────────────────────────────────
generateTileset();
generatePlayer();
generateEvents();
