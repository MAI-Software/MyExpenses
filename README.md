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

## Google Drive / Sheets (opcional)

Cada usuario conecta **su propia** cuenta de Google. La app solo necesita **un Client ID** (gratis, sin tarjeta) creado una vez por el dueño. Scope mínimo `drive.file` (solo los archivos que la app crea o que el usuario abre con el selector).

### Crear el Client ID (gratis)
1. https://console.cloud.google.com → crea un proyecto.
2. **APIs y servicios → Biblioteca** → habilita **Google Drive API** y **Google Sheets API**.
3. **Pantalla de consentimiento OAuth** → tipo **Externo** → rellena nombre/email → en *Scopes* añade `.../auth/drive.file` → añade tu email como **usuario de prueba**.
4. **Credenciales → Crear credenciales → ID de cliente de OAuth** → **Aplicación web**:
   - Orígenes JS autorizados: `https://mai-software.github.io` y `http://localhost:5173`
   - (sin URI de redirección — se usa el flujo de token de Google Identity Services)
5. Copia el **Client ID** (`...apps.googleusercontent.com`).

### Pegarlo en la app
En [`src/drive.ts`](src/drive.ts), rellena `GOOGLE_CONFIG`:
```ts
export const GOOGLE_CONFIG = {
  clientId: "TU_CLIENT_ID.apps.googleusercontent.com",
  apiKey: "", // opcional: solo para el selector de archivos existentes (Picker)
};
```
`npm run build` y deploy. En **Estrategia → Google Drive** aparecerá "Conectar Google Drive".

- **apiKey (opcional):** para "Usar un Excel/Hoja existente" se usa Google Picker, que requiere una **API key** (Credenciales → Crear → Clave de API; restríngela a Picker API). Sin ella, el resto (conectar, guardar, compartir) funciona igual.
- **Aviso "app no verificada":** normal hasta pasar la verificación de Google. Para ti y pocos usuarios basta añadirlos como *usuarios de prueba*.

## Roadmap
- [x] Fase 1: OCR + clasificación + export .xlsx local + PWA + info/privacidad
- [x] Estrategia: donut, topes de gasto, gastos fijos, notificaciones, categorías propias
- [~] Fase 2: Google Drive/Sheets — código listo; requiere pegar el Client ID en `src/drive.ts`
- [ ] Fase 3: APK real (PWABuilder / TWA)
