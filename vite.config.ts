import { defineConfig, type Plugin } from "vite";

// Content-Security-Policy. Solo se inyecta en el build (no en dev, que usa
// scripts inline/eval para el HMR). Permite únicamente los orígenes que la app
// usa de verdad: Google (login + APIs, para el plan compartido) y el CDN de
// Tesseract (OCR). 'wasm-unsafe-eval' es necesario para el WASM de Tesseract.
const CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
  "manifest-src 'self'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'wasm-unsafe-eval' https://accounts.google.com https://apis.google.com https://cdn.jsdelivr.net",
  "worker-src 'self' blob:",
  "connect-src 'self' data: blob: https://cdn.jsdelivr.net https://tessdata.projectnaptha.com https://*.googleapis.com https://accounts.google.com",
  "frame-src 'self' https://accounts.google.com https://content.googleapis.com https://docs.google.com",
].join("; ");

function cspPlugin(): Plugin {
  return {
    name: "html-csp",
    apply: "build",
    transformIndexHtml(html) {
      return html.replace(
        "</title>",
        `</title>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`
      );
    },
  };
}

export default defineConfig({
  base: "./",
  plugins: [cspPlugin()],
  build: {
    target: "es2020",
  },
});
