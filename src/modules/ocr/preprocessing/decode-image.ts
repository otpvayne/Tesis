/**
 * Decodifica un archivo de imagen a `ImageData` (píxeles crudos RGBA, sin
 * comprimir) usando `createImageBitmap` + un `<canvas>` temporal.
 *
 * Formatos soportados: los mismos que ya valida Fase 2
 * (`modules/documents/validation.ts` por magic bytes) — **JPG/JPEG y
 * PNG únicamente**. Esta función asume que el archivo ya pasó esa
 * validación (RF-004); no vuelve a revisar el MIME type aquí, evita
 * duplicar esa lógica. NO soporta GIF animado (solo se decodificaría el
 * primer frame, silenciosamente perdiendo los demás) ni WebP (fuera del
 * alcance de v1 — ver `CLAUDE.md` §4).
 *
 * `createImageBitmap` acepta un `Blob`/`File` directamente — no hace
 * falta pasar primero por `FileReader` para obtener una data URL antes de
 * decodificar, así que se omite ese paso intermedio.
 */
export async function decodeImage(file: File | Blob): Promise<ImageData> {
  if (typeof createImageBitmap !== "function") {
    throw new Error(
      "Este navegador no admite la decodificación de imágenes necesaria (createImageBitmap).",
    );
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch (cause) {
    throw new Error(
      "No se pudo decodificar la imagen: el archivo está corrupto o el formato no es compatible (solo JPG y PNG).",
      { cause },
    );
  }

  try {
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("No se pudo obtener el contexto 2D del canvas para decodificar la imagen.");
    }

    ctx.drawImage(bitmap, 0, 0);
    return ctx.getImageData(0, 0, canvas.width, canvas.height);
  } finally {
    bitmap.close();
  }
}
