export type OcrProgress = (pct: number, status: string) => void;

// Reduce la imagen para acelerar el OCR en móvil (lado máx ~1600px).
async function downscale(file: File, maxSide = 1600): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    const w = Math.round(img.width * scale);
    const h = Math.round(img.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.9);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function runOcr(file: File, onProgress?: OcrProgress): Promise<string> {
  const dataUrl = await downscale(file);
  // Carga diferida: Tesseract (~300KB + wasm) solo se descarga al capturar,
  // no en el arranque de la app. Mejora el First Load drásticamente.
  onProgress?.(0, "Cargando motor OCR…");
  const { default: Tesseract } = await import("tesseract.js");
  const { data } = await Tesseract.recognize(dataUrl, "spa+eng", {
    logger: (m) => {
      if (m.status === "recognizing text" && onProgress) {
        onProgress(Math.round(m.progress * 100), "Leyendo ticket…");
      } else if (onProgress) {
        onProgress(0, "Preparando OCR…");
      }
    },
  });
  return data.text;
}
