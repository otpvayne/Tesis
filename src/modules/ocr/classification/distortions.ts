import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Todas las distorsiones de esta fase (rotación, escala, skew) operan
 * sobre **valores continuos de gris** (no binarios) — el render de fuente
 * (Canvas `fillText`) produce antialiasing, y las propias distorsiones
 * (interpolación nearest-neighbor de todas formas, pero sobre un valor ya
 * suavizado) no necesitan preservar binariedad: la binarización real pasa
 * **después**, con `otsuBinarization` + `ensureTextIsForeground` (las
 * mismas funciones que procesan documentos reales, Fase 4a/4b) — no una
 * versión duplicada aquí. `backgroundValue` por defecto es `255` (papel
 * blanco) porque el render inicial es "texto negro sobre fondo blanco"
 * (ver `dataset-synthesizer.ts`), la misma polaridad que produce
 * fotografiar una factura real antes de Otsu.
 *
 * Mapeo **inverso**: para cada píxel de salida, se calcula qué píxel de
 * origen le corresponde (no al revés) — evita huecos sin valor que
 * dejaría un mapeo directo (source→destino) cuando la transformación deja
 * espacios sin cubrir.
 */
function applyInverseMap(
  imageData: ImageData,
  mapOutputToSource: (x: number, y: number) => { x: number; y: number },
  backgroundValue: number,
): ImageData {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const source = mapOutputToSource(x, y);
      const sx = Math.round(source.x);
      const sy = Math.round(source.y);
      const outIdx = (y * width + x) * 4;

      const value =
        sx >= 0 && sx < width && sy >= 0 && sy < height ? data[(sy * width + sx) * 4] : backgroundValue;
      output[outIdx] = value;
      output[outIdx + 1] = value;
      output[outIdx + 2] = value;
      output[outIdx + 3] = 255;
    }
  }

  return createImageData(output, width, height);
}

/**
 * Rotación alrededor del centro del lienzo, `degrees` grados (sentido
 * horario positivo). Mapeo inverso con la matriz de rotación de `-degrees`:
 *
 * ```
 * (cx, cy) = (width/2, height/2)
 * srcX = cx + (x-cx)·cos(-θ) - (y-cy)·sin(-θ)
 * srcY = cy + (x-cx)·sin(-θ) + (y-cy)·cos(-θ)
 * ```
 *
 * Interpolación nearest-neighbor (`Math.round`), no bilineal — consistente
 * con `normalize-character.ts` (Fase 4b): un carácter es una forma de
 * bordes duros, suavizar introduce grises que no aportan a HOG.
 */
export function rotateImage(imageData: ImageData, degrees: number, backgroundValue = 255): ImageData {
  const rad = (-degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = imageData.width / 2;
  const cy = imageData.height / 2;

  return applyInverseMap(
    imageData,
    (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
    },
    backgroundValue,
  );
}

/**
 * Escala alrededor del centro del lienzo (el lienzo mantiene su tamaño —
 * `factor > 1` acerca/agranda el contenido, `factor < 1` lo aleja/achica).
 * Mapeo inverso: `src = centro + (destino-centro)/factor`.
 */
export function scaleImage(imageData: ImageData, factor: number, backgroundValue = 255): ImageData {
  const cx = imageData.width / 2;
  const cy = imageData.height / 2;

  return applyInverseMap(
    imageData,
    (x, y) => ({ x: cx + (x - cx) / factor, y: cy + (y - cy) / factor }),
    backgroundValue,
  );
}

/**
 * Shear afín: desplaza cada fila horizontalmente en proporción a su
 * distancia vertical del centro (`offsetXPx` en el borde superior/inferior,
 * 0 en el centro), y cada columna verticalmente en proporción a su
 * distancia horizontal del centro (`offsetYPx` en el borde
 * izquierdo/derecho). Mapeo inverso directo (el shear no tiene componente
 * rotacional, la inversa es restar en vez de sumar el desplazamiento).
 */
export function skewImage(imageData: ImageData, offsetXPx: number, offsetYPx: number, backgroundValue = 255): ImageData {
  const { width, height } = imageData;
  const cx = width / 2;
  const cy = height / 2;

  return applyInverseMap(
    imageData,
    (x, y) => ({
      x: x - offsetXPx * ((y - cy) / cy),
      y: y - offsetYPx * ((x - cx) / cx),
    }),
    backgroundValue,
  );
}

/**
 * Ruido "sal y pimienta": cada píxel tiene probabilidad `probability` de
 * invertirse (`255 - valor`). `random` es inyectable (por defecto
 * `Math.random`) para poder escribir tests deterministas — la aleatoriedad
 * real vive en `dataset-synthesizer.ts`, no aquí.
 */
export function applySaltPepperNoise(imageData: ImageData, probability: number, random: () => number = Math.random): ImageData {
  const { data, width, height } = imageData;
  const output = new Uint8ClampedArray(data.length);

  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    const shouldInvert = random() < probability;
    const value = shouldInvert ? 255 - data[idx] : data[idx];
    output[idx] = value;
    output[idx + 1] = value;
    output[idx + 2] = value;
    output[idx + 3] = 255;
  }

  return createImageData(output, width, height);
}
