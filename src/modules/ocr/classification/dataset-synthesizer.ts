import { otsuBinarization } from "@/modules/ocr/preprocessing/otsu-binarization";
import { ensureTextIsForeground } from "@/modules/ocr/segmentation/normalize-polarity";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";
import { applySaltPepperNoise, rotateImage, scaleImage, skewImage } from "@/modules/ocr/classification/distortions";
import { Dataset, type TrainingSample } from "@/modules/ocr/classification/dataset";

export interface DistortionConfig {
  /** Rango de rotación aleatoria, en grados: `[-rotationRange, rotationRange]`. */
  rotationRange: number;
  /** Rango de escala aleatoria, como fracción: `[1-scaleRange, 1+scaleRange]`. */
  scaleRange: number;
  /** Probabilidad por píxel de ruido sal-y-pimienta, `[0, 1]`. */
  noiseLevel: number;
  /** Rango de shear aleatorio, en píxeles: `[-skewRange, skewRange]` por eje. */
  skewRange: number;
}

export interface SynthesisConfig {
  charactersToGenerate: string[];
  samplesPerCharacter: number;
  imageSize: number;
  fonts: string[];
  distortions: DistortionConfig;
}

/** Renderiza un carácter con una fuente dada, a `size×size`, texto negro sobre fondo blanco. Inyectable — ver `renderCharacterGlyph` para la implementación real de navegador. */
export type CharacterRenderer = (character: string, font: string, size: number) => ImageData;

/**
 * Implementación real: Canvas 2D + `fillText`. **Solo funciona en un
 * navegador real** — igual que `decodeImage` (Fase 4a), `document`/canvas
 * con contexto 2D y rasterización de fuentes no existen en jsdom ni en el
 * runtime de Node de esta sesión. No tiene test unitario por la misma
 * razón que `decodeImage.test.ts` no prueba la decodificación real: no
 * hay forma honesta de simular esto sin un navegador de verdad. Se prueba
 * manualmente en `/ocr-lab/train` (el equipo, en su navegador).
 */
export function renderCharacterGlyph(character: string, font: string, size: number): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("No se pudo obtener un contexto 2D de canvas para renderizar el carácter.");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#000000";
  ctx.font = `${Math.floor(size * 0.7)}px ${font}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(character, size / 2, size / 2);

  return ctx.getImageData(0, 0, size, size);
}

function randomInRange(min: number, max: number, random: () => number): number {
  return min + random() * (max - min);
}

/**
 * Recorta al bounding box de los píxeles de texto (`255`, tras Otsu +
 * corrección de polaridad) y lo empaqueta como el formato que espera
 * `normalizeCharacter` (`{width, height, pixels}`, fondo negro opaco,
 * trazo blanco) — reutiliza exactamente la misma función de
 * recorte-y-recentrado que usan los caracteres reales segmentados en
 * Fase 4b, para que un carácter sintético y uno real terminen con
 * estadísticas de encuadre comparables (importante para que el
 * fine-tuning con datos reales, Fase 4e+, tenga sentido).
 */
function isolateForegroundRegion(imageData: ImageData): { width: number; height: number; pixels: Uint8ClampedArray } {
  const { data, width, height } = imageData;
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4] === 255) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0) {
    // Ningún píxel de texto sobrevivió (fuente sin glifo para el
    // carácter, o distorsión lo borró por completo) -- región vacía 1×1,
    // no revienta el resto del pipeline.
    return { width: 1, height: 1, pixels: new Uint8ClampedArray([0, 0, 0, 255]) };
  }

  const regionWidth = maxX - minX + 1;
  const regionHeight = maxY - minY + 1;
  const pixels = new Uint8ClampedArray(regionWidth * regionHeight * 4);
  for (let i = 0; i < regionWidth * regionHeight; i++) pixels[i * 4 + 3] = 255;

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (data[(y * width + x) * 4] === 255) {
        const idx = ((y - minY) * regionWidth + (x - minX)) * 4;
        pixels[idx] = pixels[idx + 1] = pixels[idx + 2] = 255;
      }
    }
  }

  return { width: regionWidth, height: regionHeight, pixels };
}

export interface SynthesizeDatasetOptions {
  /** Por defecto `renderCharacterGlyph` (navegador real). Inyectable para poder testear la orquestación sin canvas real. */
  renderer?: CharacterRenderer;
  /** Por defecto `Math.random`. Inyectable para tests deterministas. */
  random?: () => number;
}

/**
 * Genera un `Dataset` sintético: para cada carácter × muestra, elige una
 * fuente al azar, renderiza el glifo, aplica rotación → escala → shear →
 * ruido (en ese orden — geométricas antes que el ruido, para no
 * distorsionar el ruido mismo), y termina con el **mismo binarizado +
 * corrección de polaridad + recorte/recentrado que procesa documentos
 * reales** (`otsuBinarization`, `ensureTextIsForeground`,
 * `normalizeCharacter` — Fase 4a/4b, no reimplementado aquí).
 *
 * `label`/`sourceDocument`/`confidence` de cada `TrainingSample`:
 * `sourceDocument` codifica fuente + rotación aplicada, para poder
 * rastrear qué combinación produjo una muestra problemática.
 * `confidence = 1` — es sintético, la etiqueta es la verdad por
 * construcción, no una estimación.
 */
export function synthesizeDataset(config: SynthesisConfig, options: SynthesizeDatasetOptions = {}): Dataset {
  const renderer = options.renderer ?? renderCharacterGlyph;
  const random = options.random ?? Math.random;
  const { rotationRange, scaleRange, noiseLevel, skewRange } = config.distortions;

  const samples: TrainingSample[] = [];

  for (const character of config.charactersToGenerate) {
    for (let i = 0; i < config.samplesPerCharacter; i++) {
      const font = config.fonts[Math.floor(random() * config.fonts.length)];
      const base = renderer(character, font, config.imageSize);

      const rotationDeg = randomInRange(-rotationRange, rotationRange, random);
      const scaleFactor = 1 + randomInRange(-scaleRange, scaleRange, random);
      const skewXPx = randomInRange(-skewRange, skewRange, random);
      const skewYPx = randomInRange(-skewRange, skewRange, random);

      let distorted = rotateImage(base, rotationDeg);
      distorted = scaleImage(distorted, scaleFactor);
      distorted = skewImage(distorted, skewXPx, skewYPx);
      distorted = applySaltPepperNoise(distorted, noiseLevel, random);

      const binary = otsuBinarization(distorted);
      const foreground = ensureTextIsForeground(binary);
      const region = isolateForegroundRegion(foreground);
      const characterImageData = normalizeCharacter(region, config.imageSize);

      samples.push({
        characterImageData,
        label: character,
        sourceDocument: `synthetic:${font}:rot${rotationDeg.toFixed(1)}:scale${scaleFactor.toFixed(2)}`,
        confidence: 1,
      });
    }
  }

  return new Dataset(samples);
}
