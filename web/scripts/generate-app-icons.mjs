import sharp from "sharp";
import fs from "fs";

function svgFor(size, { round = true } = {}) {
  const r = round ? Math.round(size * 0.12) : 0;
  const font = Math.round(size * 0.52);
  return Buffer.from(`<?xml version="1.0" encoding="UTF-8"?>
<svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${size}" height="${size}" rx="${r}" fill="#003B7C"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
    font-family="Arial Black, Helvetica Neue, Helvetica, Arial, sans-serif"
    font-size="${font}" font-weight="800" fill="#ffffff">H</text>
</svg>`);
}

async function make(size, out, opts) {
  await sharp(svgFor(size, opts)).png().toFile(out);
  console.log("wrote", out);
}

/** Icône maskable Android : zone sûre ~80 % au centre. */
async function makeMaskable(size, out) {
  const pad = Math.round(size * 0.18);
  const inner = size - pad * 2;
  const mark = await sharp(svgFor(inner, { round: false })).png().toBuffer();
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: { r: 0, g: 59, b: 124 },
    },
  })
    .composite([{ input: mark, left: pad, top: pad }])
    .png()
    .toFile(out);
  console.log("wrote", out);
}

(async () => {
  fs.mkdirSync("public/icons", { recursive: true });
  await make(512, "public/icons/icon-512.png");
  await make(192, "public/icons/icon-192.png");
  await makeMaskable(512, "public/icons/icon-maskable-512.png");
  await make(180, "public/apple-touch-icon.png");
  await make(180, "src/app/apple-icon.png");
  await make(32, "src/app/icon.png");
  await make(48, "public/favicon-48.png");
  // Remplace l’ancien favicon Vercel servi à /favicon.ico
  await make(32, "public/favicon.ico", { round: false });
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
