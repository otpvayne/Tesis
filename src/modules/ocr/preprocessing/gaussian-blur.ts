import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Kernel Gaussiano 3×3 (radio fijo en 1, no crece con `sigma`) — el mismo
 * `sigma` que recibe `gaussianBlur`, pero sin agrandar la ventana: un
 * kernel más grande difuminaría más el trazo de un carácter pequeño, el
 * mismo problema de fondo que llevó a desactivar `denoise` (ver
 * `OCR_CONFIG.APPLY_DENOISE`). `sigma` controla qué tan concentrado está
 * el peso en el centro dentro de esa ventana fija, no el tamaño de la
 * ventana.
 *
 * ```
 * peso(dx, dy) = exp(-(dx² + dy²) / (2·sigma²)),  dx, dy ∈ {-1, 0, 1}
 * kernel(dx, dy) = peso(dx, dy) / Σ peso
 * ```
 *
 * Ejemplo verificado en `gaussian-blur.test.ts`: con `sigma = 1`, el peso
 * central es `1`, los 4 vecinos ortogonales `e^(-0.5) ≈ 0.6065`, las 4
 * esquinas `e^(-1) ≈ 0.3679`; la suma total es `≈ 4.8976`, así que el
 * peso central normalizado es `1/4.8976 ≈ 0.2042`.
 */
export function computeGaussianKernel3x3(sigma: number): number[][] {
  const weights: number[][] = [];
  let sum = 0;

  for (let dy = -1; dy <= 1; dy++) {
    const row: number[] = [];
    for (let dx = -1; dx <= 1; dx++) {
      const weight = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      row.push(weight);
      sum += weight;
    }
    weights.push(row);
  }

  return weights.map((row) => row.map((weight) => weight / sum));
}

/**
 * Suavizado Gaussiano con kernel fijo 3×3, aplicado sobre la imagen en
 * escala de grises **antes** de `otsuBinarization` (a diferencia de
 * `denoise`, que trabaja sobre la salida ya binaria de Otsu). Al operar
 * sobre valores continuos (0-255, no solo 0/255), promedia ruido de alta
 * frecuencia (grano de sensor, artefactos de compresión JPEG) sin la
 * votación de mayoría "todo o nada" de un filtro de mediana — un trazo
 * delgado se difumina un poco en los bordes pero el centro del trazo
 * sigue siendo lo bastante oscuro para cruzar el threshold de Otsu, en
 * vez de desaparecer por completo como pasaba con `denoise` sobre la
 * imagen binaria (ver limitación documentada en `denoise.ts`).
 *
 * Bordes de la imagen: replicación (igual que `denoise.ts`), no padding
 * artificial.
 */
export function gaussianBlur(imageData: ImageData, sigma: number = 1): ImageData {
  const { data, width, height } = imageData;
  const kernel = computeGaussianKernel3x3(sigma);
  const output = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let ky = -1; ky <= 1; ky++) {
        const ny = Math.min(height - 1, Math.max(0, y + ky));
        for (let kx = -1; kx <= 1; kx++) {
          const nx = Math.min(width - 1, Math.max(0, x + kx));
          acc += data[(ny * width + nx) * 4] * kernel[ky + 1][kx + 1];
        }
      }

      const value = Math.round(acc);
      const outIdx = (y * width + x) * 4;
      output[outIdx] = value;
      output[outIdx + 1] = value;
      output[outIdx + 2] = value;
      output[outIdx + 3] = data[outIdx + 3];
    }
  }

  return createImageData(output, width, height);
}
