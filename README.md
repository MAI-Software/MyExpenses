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

## Plan compartido (Google Sheets) — opcional

Un "plan" = una hoja de Google compartida donde pareja/familia sincronizan. Cada persona conecta **su propia** cuenta. La app solo necesita **un Client ID** (gratis, sin tarjeta) creado una vez por el dueño. **Sin API key** (no se usa Picker; la unión es por enlace).

Scopes: `drive.file` (crear/compartir la hoja del plan) + `spreadsheets` (leer/escribir una hoja compartida por su id al unirse por enlace). `spreadsheets` da acceso a las hojas del usuario — es el coste de la unión por enlace de un toque.

### Crear el Client ID (gratis)
1. https://console.cloud.google.com → crea un proyecto.
2. **APIs y servicios → Biblioteca** → habilita **Google Drive API** y **Google Sheets API**.
3. **Pantalla de consentimiento OAuth** → tipo **Externo** → rellena nombre/email → en *Scopes* añade `.../auth/drive.file` y `.../auth/spreadsheets` → añade tu email (y el de tu pareja) como **usuarios de prueba**.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → **Aplicación web**:
   - Orígenes JS autorizados: `https://mai-software.github.io` y `http://localhost:5173`
   - (sin URI de redirección — flujo de token de Google Identity Services)
5. Copia el **Client ID** (`...apps.googleusercontent.com`).

### Pegarlo en la app
En [`src/drive.ts`](src/drive.ts):
```ts
export const GOOGLE_CONFIG = {
  clientId: "TU_CLIENT_ID.apps.googleusercontent.com",
};
```
`npm run build` y deploy. En **Estrategia → Plan compartido** aparecerá "Conectar Google".

### Cómo funciona
- **Tú:** Conectar Google → Crear plan compartido → *Compartir por WhatsApp* (o *Invitar por email*).
- *Compartir por WhatsApp* pone la hoja como **"cualquiera con el enlace puede editar"** y abre WhatsApp con un enlace a la app (`.../MyExpenses/#plan=ID`). ⚠️ No publiques ese enlace.
- **Tu pareja:** toca el enlace → aterriza en la app (GitHub Pages; si no la tiene, puede instalarla) → el plan queda vinculado → Conectar Google → ya sincroniza en la misma hoja.
- **Sincronizar** sube tus filas nuevas (por `id`) y baja las del otro. No sobrescribe.

- **Aviso "app no verificada":** normal hasta pasar la verificación de Google. Para ti y pocos usuarios basta añadirlos como *usuarios de prueba*.

## Roadmap
- [x] Fase 1: OCR + clasificación + export .xlsx local + PWA + info/privacidad
- [x] Estrategia: donut, topes, gastos fijos, notificaciones, categorías propias
- [~] Fase 2: Plan compartido (Google Sheets) — código listo; requiere pegar el Client ID en `src/drive.ts`
- [ ] Fase 3: APK real (PWABuilder / TWA)
