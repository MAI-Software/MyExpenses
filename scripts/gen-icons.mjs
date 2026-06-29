// Genera PNGs de icono a partir de public/icon.svg usando sharp.
// Uso: npm run icons
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = join(root, "public", "icon.svg");
const outDir = join(root, "public", "icons");

await mkdir(outDir, { recursive: true });

const jobs = [
  { size: 192, file: "icon-192.png", pad: 0 },
  { size: 512, file: "icon-512.png", pad: 0 },
  // maskable: margen de seguridad (~12%) para que no se recorte el glifo
  { size: 512, file: "icon-512-maskable.png", pad: 64 },
];

for (const j of jobs) {
  const inner = j.size - j.pad * 2;
  const glyph = await sharp(src).resize(inner, inner).png().toBuffer();
  await sharp({
    create: {
      width: j.size,
      height: j.size,
      channels: 4,
      background: { r: 12, g: 15, b: 22, alpha: 1 },
    },
  })
    .composite([{ input: glyph, left: j.pad, top: j.pad }])
    .png()
    .toFile(join(outDir, j.file));
  console.log("✓", j.file);
}
console.log("Iconos generados en public/icons/");
