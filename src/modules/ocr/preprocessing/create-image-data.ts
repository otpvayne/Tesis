/**
 * Crea un `ImageData` de forma segura tanto en navegador real (usa el
 * constructor nativo `ImageData`, más rápido y con sus propias
 * validaciones) como en el entorno de tests (jsdom no implementa
 * `ImageData` — se cae a un objeto plano con la misma forma, que
 * TypeScript acepta por tipado estructural). Todas las funciones de
 * `modules/ocr/preprocessing` construyen su `ImageData` de salida a
 * través de este helper en vez de llamar `new ImageData(...)` directo,
 * para que sean testeables sin un canvas real.
 */
export function createImageData(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): ImageData {
  if (typeof ImageData !== "undefined") {
    // El constructor de ImageData exige Uint8ClampedArray<ArrayBuffer>
    // específicamente; `data` llega tipado como Uint8ClampedArray<ArrayBufferLike>
    // (incluye SharedArrayBuffer), que TS no acepta implícitamente aunque
    // en la práctica siempre es un ArrayBuffer normal aquí.
    return new ImageData(data as unknown as Uint8ClampedArray<ArrayBuffer>, width, height);
  }
  return { data, width, height, colorSpace: "srgb" } as ImageData;
}
