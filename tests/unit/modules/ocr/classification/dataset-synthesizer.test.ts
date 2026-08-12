import { describe, expect, it } from "vitest";
import { synthesizeDataset, type CharacterRenderer } from "@/modules/ocr/classification/dataset-synthesizer";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";

/**
 * Renderer falso para tests: NO usa canvas/fuentes reales (eso requiere
 * un navegador, ver nota en `dataset-synthesizer.ts`). Dibuja un
 * cuadrado negro sobre fondo blanco, de tamaño determinista según el
 * carácter, para poder verificar que la orquestación (conteos, labels,
 * dimensiones) funciona sin depender de renderizado real de texto.
 */
const fakeRenderer: CharacterRenderer = (character, _font, size) => {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
    data[i * 4 + 3] = 255;
  }
  const squareSize = 6 + (character.charCodeAt(0) % 6);
  const start = Math.floor((size - squareSize) / 2);
  for (let y = start; y < start + squareSize; y++) {
    for (let x = start; x < start + squareSize; x++) {
      const idx = (y * size + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = 0;
    }
  }
  return createImageData(data, size, size);
};

function fixedRandom(sequence: number[]): () => number {
  let i = 0;
  return () => sequence[i++ % sequence.length];
}

describe("synthesizeDataset", () => {
  it("genera exactamente charactersToGenerate.length × samplesPerCharacter muestras, distribuidas uniformemente", () => {
    const dataset = synthesizeDataset(
      {
        charactersToGenerate: ["A", "B", "0"],
        samplesPerCharacter: 10,
        imageSize: 32,
        fonts: ["Arial"],
        distortions: { rotationRange: 0, scaleRange: 0, noiseLevel: 0, skewRange: 0 },
      },
      { renderer: fakeRenderer, random: fixedRandom([0.1, 0.4, 0.6, 0.9]) },
    );

    expect(dataset.samples).toHaveLength(30);
    expect(dataset.labelCounts).toEqual({ A: 10, B: 10, "0": 10 });
  });

  it("cada muestra tiene characterImageData de imageSize×imageSize (normalizado, aunque el glifo original sea más chico)", () => {
    const dataset = synthesizeDataset(
      {
        charactersToGenerate: ["X"],
        samplesPerCharacter: 3,
        imageSize: 32,
        fonts: ["Arial"],
        distortions: { rotationRange: 0, scaleRange: 0, noiseLevel: 0, skewRange: 0 },
      },
      { renderer: fakeRenderer, random: fixedRandom([0.5]) },
    );

    for (const sample of dataset.samples) {
      expect(sample.characterImageData.width).toBe(32);
      expect(sample.characterImageData.height).toBe(32);
      expect(sample.label).toBe("X");
      expect(sample.confidence).toBe(1);
      expect(sample.sourceDocument).toContain("synthetic:Arial:rot");
    }
  });

  it("con distorsión 0 en todo, dos muestras del mismo carácter dan la misma imagen (determinista con random fijo)", () => {
    const config = {
      charactersToGenerate: ["Q"],
      samplesPerCharacter: 2,
      imageSize: 16,
      fonts: ["Arial"],
      distortions: { rotationRange: 0, scaleRange: 0, noiseLevel: 0, skewRange: 0 },
    };
    const dataset = synthesizeDataset(config, { renderer: fakeRenderer, random: fixedRandom([0.5, 0.5, 0.5, 0.5]) });

    const [a, b] = dataset.samples;
    expect(Array.from(a.characterImageData.data)).toEqual(Array.from(b.characterImageData.data));
  });

  it("elige la fuente según random(): con random()=0 siempre usa fonts[0], con random() cercano a 1 usa la última", () => {
    // El renderer codifica que fuente le pidieron dibujando un cuadrado de
    // tamaño = (indice de la fuente en `fonts`)+6 -- permite verificar
    // exactamente qué fuente uso synthesizeDataset sin tocar canvas real.
    const fonts = ["FontA", "FontB", "FontC"];
    const fontAwareRenderer: CharacterRenderer = (_character, font, size) => {
      const data = new Uint8ClampedArray(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
        data[i * 4 + 3] = 255;
      }
      const squareSize = 6 + fonts.indexOf(font);
      for (let y = 0; y < squareSize; y++) {
        for (let x = 0; x < squareSize; x++) {
          const idx = (y * size + x) * 4;
          data[idx] = data[idx + 1] = data[idx + 2] = 0;
        }
      }
      return createImageData(data, size, size);
    };

    const config = {
      charactersToGenerate: ["A"],
      samplesPerCharacter: 1,
      imageSize: 32,
      fonts,
      distortions: { rotationRange: 0, scaleRange: 0, noiseLevel: 0, skewRange: 0 },
    };

    // random()=0 -> Math.floor(0*3)=0 -> fonts[0]="FontA" (ademas se reusa
    // para rotacion/escala/skew, todos en su valor minimo/neutral con rango 0)
    const withFirstFont = synthesizeDataset(config, { renderer: fontAwareRenderer, random: fixedRandom([0]) });
    // random()=0.99 -> Math.floor(0.99*3)=2 -> fonts[2]="FontC"
    const withLastFont = synthesizeDataset(config, { renderer: fontAwareRenderer, random: fixedRandom([0.99]) });

    expect(withFirstFont.samples[0].sourceDocument).toContain("synthetic:FontA:");
    expect(withLastFont.samples[0].sourceDocument).toContain("synthetic:FontC:");
  });

  it("una fuente que no puede renderizar el carácter (glifo vacío) no revienta, produce una región 1×1 normalizada", () => {
    const emptyRenderer: CharacterRenderer = (_character, _font, size) => {
      const data = new Uint8ClampedArray(size * size * 4);
      for (let i = 0; i < size * size; i++) {
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = 255;
        data[i * 4 + 3] = 255;
      }
      return createImageData(data, size, size);
    };

    const dataset = synthesizeDataset(
      {
        charactersToGenerate: ["?"],
        samplesPerCharacter: 1,
        imageSize: 32,
        fonts: ["Arial"],
        distortions: { rotationRange: 0, scaleRange: 0, noiseLevel: 0, skewRange: 0 },
      },
      { renderer: emptyRenderer, random: fixedRandom([0]) },
    );

    expect(dataset.samples).toHaveLength(1);
    expect(dataset.samples[0].characterImageData.width).toBe(32);
    expect(dataset.samples[0].characterImageData.height).toBe(32);
  });
});
