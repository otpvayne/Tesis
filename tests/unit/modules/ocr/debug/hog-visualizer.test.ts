import { describe, expect, it } from "vitest";
import { hogDescriptorToSvg } from "@/modules/ocr/debug/hog-visualizer";
import type { HOGConfig } from "@/modules/ocr/classification/hog-extractor";

const CONFIG: HOGConfig = { gridCols: 2, gridRows: 1, orientationBins: 3 };

describe("hogDescriptorToSvg", () => {
  it("lanza un error claro si el descriptor no tiene el largo esperado por la config", () => {
    expect(() => hogDescriptorToSvg(new Float32Array(4), CONFIG)).toThrow(/se esperaban 6/i);
  });

  it("produce un <svg> con el ancho/alto derivados de gridCols/gridRows × cellPixels", () => {
    const descriptor = new Float32Array(CONFIG.gridCols * CONFIG.gridRows * CONFIG.orientationBins);
    const svg = hogDescriptorToSvg(descriptor, CONFIG, 10);
    expect(svg).toContain('width="20"');
    expect(svg).toContain('height="10"');
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("un descriptor todo en cero no dibuja ningún segmento de orientación (solo grilla)", () => {
    const descriptor = new Float32Array(CONFIG.gridCols * CONFIG.gridRows * CONFIG.orientationBins);
    const svg = hogDescriptorToSvg(descriptor, CONFIG);
    expect(svg).not.toContain("#1d4ed8");
  });

  it("un bin distinto de cero por región produce exactamente gridCols×gridRows segmentos de orientación", () => {
    const descriptor = new Float32Array(CONFIG.gridCols * CONFIG.gridRows * CONFIG.orientationBins);
    // Un solo bin activo en cada una de las 2 regiones (índices 0 y 3).
    descriptor[0] = 0.8;
    descriptor[3] = 0.5;
    const svg = hogDescriptorToSvg(descriptor, CONFIG);
    const matches = svg.match(/#1d4ed8/g) ?? [];
    expect(matches.length).toBe(2);
  });

  it("acepta tanto Float32Array como number[] (mismo dato serializado que devuelve build-debug-report)", () => {
    const descriptorArray = Array.from({ length: 6 }, () => 0);
    expect(() => hogDescriptorToSvg(descriptorArray, CONFIG)).not.toThrow();
  });
});
