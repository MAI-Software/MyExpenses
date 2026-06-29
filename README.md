# MyExpenses

Control de gasto por foto de ticket. PWA — haz una foto del ticket (o súbela), la app lo lee (OCR), extrae importe/comercio/fecha, lo clasifica por categoría y lo guarda. Export a Excel (.xlsx).

Creado por **MAISoftwares**. Nombre provisional.

## Stack
- Vite + TypeScript (vanilla, sin framework)
- Tesseract.js — OCR 100% en el navegador (offline, sin servidor)
- SheetJS (xlsx) — export a Excel
- PWA: instalable en el móvil, service worker, manifest

## Privacidad
Todo es local: las imágenes se procesan en el dispositivo, los gastos se guardan en `localStorage`. Sin cookies de seguimiento, sin servidores, sin terceros.

## Desarrollo
```bash
npm install
npm run icons   # genera PNGs del icono desde public/icon.svg
npm run dev     # http://localhost:5173
npm run build   # genera dist/
```

## Deploy a GitHub Pages
1. Crear repo nuevo (org MAISoftwares).
2. `npm run build` genera `dist/`.
3. Publicar `dist/` en GitHub Pages (rama `gh-pages` o GitHub Actions).
4. `base` de Vite es `./` (relativa), funciona en `usuario.github.io/REPO/` sin tocar config.

## Roadmap
- [x] Fase 1: OCR + clasificación + export .xlsx local + PWA + info/privacidad
- [ ] Fase 2: Google Drive/Sheets (OAuth) — leer/crear/editar Excel en carpeta Drive
- [ ] Fase 3: APK real (PWABuilder / TWA)
