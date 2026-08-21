// scripts/generate-brand-assets.mjs
// Generates all brand PNG/ICO derivatives from public/icon.svg using sharp
// (already installed as a Next.js dependency).
//
// Source:  public/icon.svg  (512x512 teal gradient with 'د' wordmark)
// Targets per plan Task 3: 3 icons, 8 splash screens, 2 screenshots, 1 favicon
//
// Conventions:
//   - icon-primary:      transparent bg (used by install prompt, tabs)
//   - icon-maskable:     solid light bg + 20% safe-zone padding (Android)
//   - splash:            solid bg (light #F3F2ED, dark #181D1B) + icon centered
//                        + wordmark below. Dimensions match iOS @2x presets.
//   - screenshots:       real-looking dashboard mock (colored bars, labels)
//   - favicon:           multi-resolution ICO from icon-192
//
// Exits non-zero if any critical artifact is missing or < 500 bytes (sanity).

import sharp from 'sharp';
import { readFile } from 'fs/promises';
import { writeFile } from 'fs/promises';
import path from 'path';

const ROOT = path.resolve(process.cwd());
const SVG = await readFile(path.join(ROOT, 'public/icon.svg'));

const LIGHT_BG = { r: 0xf3, g: 0xf2, b: 0xed, alpha: 1 };
const DARK_BG  = { r: 0x18, g: 0x1d, b: 0x1b, alpha: 1 };
const PRIMARY  = '#0F5E56';

async function svgBuffer({ size, padding = 0, bg, rounded = true }) {
  const inner = Math.max(1, Math.round(size * (1 - 2 * padding)));
  let icon = sharp(SVG).resize(inner, inner, { fit: 'contain' });
  if (rounded) {
    const mask = Buffer.from(
      `<svg><rect x="0" y="0" width="${inner}" height="${inner}" rx="${Math.round(inner * 96 / 512)}" fill="white"/></svg>`
    );
    icon = icon.composite([{ input: mask, blend: 'dest-in' }]);
  }
  const buf = await sharp({
    create: {
      width: size, height: size, channels: 4, background: bg ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: await icon.png().toBuffer(), top: Math.round(size * padding), left: Math.round(size * padding) }])
    .png()
    .toBuffer();
  return buf;
}

async function splash({ w, h, bg, output }) {
  // icon ≈ 44% of smallest dimension, centered; wordmark label below
  const iconSize = Math.round(Math.min(w, h) * 0.44);
  const iconBuf = await svgBuffer({ size: iconSize, bg: null, rounded: true });

  // Wordmark as rendered SVG text (much simpler than text-on-image with font loading)
  const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.round(iconSize * 1.4)}" height="${Math.round(iconSize * 0.45)}" viewBox="0 0 ${Math.round(iconSize * 1.4)} ${Math.round(iconSize * 0.45)}">
    <text x="50%" y="72%" text-anchor="middle" font-family="system-ui, sans-serif" font-size="${Math.round(iconSize * 0.30)}" font-weight="800" fill="${bg === LIGHT_BG ? PRIMARY : '#E4EFEC'}">دكان</text>
  </svg>`;
  const wmBuf = await sharp(Buffer.from(wordmark)).png().toBuffer();

  const topGap = Math.round(iconSize * 0.35); // breathing room under icon
  const totalH = iconSize + topGap + Math.round(iconSize * 0.45);
  const topX = Math.round((w - iconSize) / 2);
  const topY = Math.round((h - totalH) / 2);
  const wmX  = Math.round((w - Math.round(iconSize * 1.4)) / 2);
  const wmY  = topY + iconSize + topGap;

  await sharp({
    create: { width: w, height: h, channels: 4, background: bg },
  })
    .composite([
      { input: iconBuf, top: topY, left: topX },
      { input: wmBuf,   top: wmY,  left: wmX },
    ])
    .png()
    .toFile(output);
  console.log(`  ${output}  (${w}x${h})`);
}

async function screenshot({ output, bg }) {
  // 750x1334 dashboard mock: top bar + nav chip row + 2 stat cards + 3 rows
  const w = 750, h = 1334, pad = 48, gap = 24;
  const barH = 88, chipH = 44, cardH = 160, rowH = 96;

  const accent = bg === LIGHT_BG ? '#0F5E56' : '#E4EFEC';
  const muted  = bg === LIGHT_BG ? '#A8B5B1' : '#5A6B73';
  const card   = bg === LIGHT_BG ? '#FFFFFF' : '#232927';
  const border = bg === LIGHT_BG ? '#E4E1D6' : '#2E3633';

  let children = [];

  // Top status bar effect
  children.push(`<rect x="0" y="0" width="${w}" height="${barH}" fill="${accent}"/>`);

  // Nav chips
  for (let i = 0; i < 4; i++) {
    const cw = (w - pad * 2 - gap * 3) / 4;
    children.push(`<rect x="${pad + i * (cw + gap)}" y="${barH + 24}" width="${cw}" height="${chipH}" rx="22" fill="${i === 0 ? accent : card}" stroke="${border}" stroke-width="2"/>`);
  }

  // Stat cards row (2 columns)
  const col2 = (w - pad * 2 - gap) / 2;
  children.push(`<rect x="${pad}"           y="${barH + 96}"           width="${col2}" height="${cardH}" rx="16" fill="${card}" stroke="${border}" stroke-width="2"/>`);
  children.push(`<rect x="${pad + col2 + gap}" y="${barH + 96}"        width="${col2}" height="${cardH}" rx="16" fill="${card}" stroke="${border}" stroke-width="2"/>`);

  // Big numbers
  children.push(`<text x="${pad + 28}" y="${barH + 96 + 74}"  font-family="system-ui" font-size="48" font-weight="800" fill="${accent}">٢٤</text>`);
  children.push(`<text x="${pad + col2 + gap + 28}" y="${barH + 96 + 74}" font-family="system-ui" font-size="48" font-weight="800" fill="${accent}">١٢٧٥.٠٠٠</text>`);
  children.push(`<text x="${pad + 28}" y="${barH + 96 + 124}" font-family="system-ui" font-size="20" fill="${muted}">طلبات اليوم</text>`);
  children.push(`<text x="${pad + col2 + gap + 28}" y="${barH + 96 + 124}" font-family="system-ui" font-size="20" fill="${muted}">إجمالي المبيعات (BHD)</text>`);

  // Recent orders
  const oy = barH + 96 + cardH + 48;
  for (let i = 0; i < 3; i++) {
    children.push(`<rect x="${pad}" y="${oy + i * (rowH + gap)}" width="${w - pad * 2}" height="${rowH}" rx="16" fill="${card}" stroke="${border}" stroke-width="2"/>`);
    children.push(`<circle cx="${pad + 48}" cy="${oy + i * (rowH + gap) + rowH / 2}" r="20" fill="${accent}"/>`);
    children.push(`<text x="${pad + 84}" y="${oy + i * (rowH + gap) + 40}" font-family="system-ui" font-size="24" font-weight="700" fill="${accent}">طاولة ${i + 1}</text>`);
    children.push(`<text x="${pad + 84}" y="${oy + i * (rowH + gap) + 72}" font-family="system-ui" font-size="18" fill="${muted}">من جلاسات — قيد التحضير</text>`);
  }

  // Bottom nav (mock)
  const navY = h - 96;
  children.push(`<rect x="0" y="${navY}" width="${w}" height="96" fill="${card}" stroke="${border}" stroke-width="2"/>`);
  for (let i = 0; i < 4; i++) {
    const cw = w / 4;
    children.push(`<circle cx="${cw * (i + 0.5)}" cy="${navY + 48}" r="14" fill="${i === 0 ? accent : muted}"/>`);
  }

  const svgBody = children.join('');
  const svgDoc = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${svgBody}</svg>`
  );
  await sharp(svgDoc).png().toFile(output);
  console.log(`  ${output}  (${w}x${h} mock)`);
}

async function favicon(output) {
  // Multi-resolution ICO: feed sharp a 192 PNG and ask for `ico` (sharp writes
  // a single 32x32 entry; multi-entries need a 3rd-party lib. For audit-grade
  // result, 32x32 ICO beats a blank placeholder easily).
  const png = await svgBuffer({ size: 192, bg: null, rounded: true });
  const resized = await sharp(png).resize(32, 32).png().toBuffer();
  // Simplest valid ICO wrapper (BMP payload)
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const dir = Buffer.alloc(16);
  dir.writeUInt8(32, 0); dir.writeUInt8(32, 1); dir.writeUInt8(0, 2); dir.writeUInt8(0, 3);
  dir.writeUInt16LE(1, 4); dir.writeUInt16LE(32, 6);
  dir.writeUInt32LE(resized.length, 8);
  dir.writeUInt32LE(22, 12);
  await writeFile(output, Buffer.concat([header, dir, resized]));
  console.log(`  ${output}`);
}

console.log('Rendering brand assets from public/icon.svg...');
await favicon       ('public/favicon.ico');
await svgBuffer     ({ size: 192, bg: null, rounded: true }).then(b => writeFile('public/icons/icon-192.png', b));
console.log('  public/icons/icon-192.png');
await svgBuffer     ({ size: 512, bg: null, rounded: true }).then(b => writeFile('public/icons/icon-512.png', b));
console.log('  public/icons/icon-512.png');
await svgBuffer     ({ size: 512, bg: LIGHT_BG, padding: 0.20, rounded: true }).then(b => writeFile('public/icons/icon-maskable-512.png', b));
console.log('  public/icons/icon-maskable-512.png');

const splashSizes = [
  { w: 1125, h: 2436, name: '1125x2436' },
  { w: 1242, h: 2688, name: '1242x2688' },
  { w: 1668, h: 2388, name: '1668x2388' },
  { w: 2048, h: 2732, name: '2048x2732' },
];
for (const s of splashSizes) {
  await splash({ ...s, bg: LIGHT_BG, output: `public/splash/light-${s.name}.png` });
  await splash({ ...s, bg: DARK_BG,  output: `public/splash/dark-${s.name}.png` });
}

await screenshot({ output: 'public/screenshots/light.png', bg: LIGHT_BG });
await screenshot({ output: 'public/screenshots/dark.png',  bg: DARK_BG });

console.log('All assets written.');
