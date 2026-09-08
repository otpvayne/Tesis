import { describe, expect, it } from "vitest";
import { mapTesseractResultToOCRResult } from "@/modules/ocr/engines/tesseract-engine";
import type { Page as TesseractPage } from "tesseract.js";

/**
 * `mapTesseractResultToOCRResult` es pura (no llama al motor WASM real de
 * Tesseract.js), así que se testea con objetos `Page`-shaped construidos a
 * mano — igual que `runOCRPipelineOnImageData` se testea con `ImageData`
 * sintética en vez de imágenes reales (Fase 4a/4e).
 */

function fakeBbox(x0: number, y0: number, x1: number, y1: number) {
  return { x0, y0, x1, y1 };
}

function fakePage(overrides: Partial<TesseractPage>): TesseractPage {
  return {
    blocks: null,
    confidence: 0,
    oem: "",
    osd: "",
    psm: "",
    text: "",
    version: "",
    hocr: null,
    tsv: null,
    box: null,
    unlv: null,
    sd: null,
    imageColor: null,
    imageGrey: null,
    imageBinary: null,
    rotateRadians: null,
    pdf: null,
    debug: null,
    ...overrides,
  } as TesseractPage;
}

describe("mapTesseractResultToOCRResult", () => {
  it("aplana blocks -> paragraphs -> lines a OCRLine[], convirtiendo bbox y confidence", () => {
    const page = fakePage({
      blocks: [
        {
          text: "NIT 900123456\nTOTAL 150000",
          confidence: 80,
          bbox: fakeBbox(0, 0, 200, 60),
          blocktype: "",
          page: undefined as unknown as TesseractPage,
          paragraphs: [
            {
              text: "NIT 900123456\nTOTAL 150000",
              confidence: 80,
              bbox: fakeBbox(0, 0, 200, 60),
              is_ltr: true,
              lines: [
                {
                  text: "NIT 900123456\n",
                  confidence: 90,
                  baseline: { x0: 0, y0: 10, x1: 100, y1: 10 },
                  rowAttributes: { ascenders: 0, descenders: 0, rowHeight: 20 },
                  bbox: fakeBbox(0, 0, 200, 20),
                  words: [],
                },
                {
                  text: "TOTAL 150000\n",
                  confidence: 70,
                  baseline: { x0: 0, y0: 40, x1: 100, y1: 40 },
                  rowAttributes: { ascenders: 0, descenders: 0, rowHeight: 20 },
                  bbox: fakeBbox(0, 30, 200, 60),
                  words: [],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = mapTesseractResultToOCRResult(page, { preprocess: 0, segmentation: 0, recognition: 12, total: 12 });

    expect(result.lines).toEqual([
      { text: "NIT 900123456", bbox: { x: 0, y: 0, width: 200, height: 20 }, confidence: 0.9 },
      { text: "TOTAL 150000", bbox: { x: 0, y: 30, width: 200, height: 30 }, confidence: 0.7 },
    ]);
    expect(result.rawText).toBe("NIT 900123456\nTOTAL 150000");
    expect(result.confidence).toBeCloseTo(0.8, 5);
    expect(result.timingMs).toEqual({ preprocess: 0, segmentation: 0, recognition: 12, total: 12 });
  });

  it("devuelve un OCRResult vacío (confidence 0) cuando blocks es null", () => {
    const page = fakePage({ blocks: null });

    const result = mapTesseractResultToOCRResult(page, { preprocess: 0, segmentation: 0, recognition: 5, total: 5 });

    expect(result.lines).toEqual([]);
    expect(result.rawText).toBe("");
    expect(result.confidence).toBe(0);
  });

  it("descarta líneas vacías o de solo salto de línea", () => {
    const page = fakePage({
      blocks: [
        {
          text: "\n",
          confidence: 0,
          bbox: fakeBbox(0, 0, 0, 0),
          blocktype: "",
          page: undefined as unknown as TesseractPage,
          paragraphs: [
            {
              text: "\n",
              confidence: 0,
              bbox: fakeBbox(0, 0, 0, 0),
              is_ltr: true,
              lines: [
                {
                  text: "   \n",
                  confidence: 50,
                  baseline: { x0: 0, y0: 0, x1: 0, y1: 0 },
                  rowAttributes: { ascenders: 0, descenders: 0, rowHeight: 0 },
                  bbox: fakeBbox(0, 0, 0, 0),
                  words: [],
                },
              ],
            },
          ],
        },
      ],
    });

    const result = mapTesseractResultToOCRResult(page, { preprocess: 0, segmentation: 0, recognition: 1, total: 1 });

    expect(result.lines).toEqual([]);
    expect(result.rawText).toBe("");
    expect(result.confidence).toBe(0);
  });
});
