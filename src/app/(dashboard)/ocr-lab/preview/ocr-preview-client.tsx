"use client";

import { useEffect, useRef, useState } from "react";
import { decodeImage } from "@/modules/ocr/preprocessing/decode-image";
import { toGrayscale } from "@/modules/ocr/preprocessing/grayscale";
import { normalizeRange } from "@/modules/ocr/preprocessing/normalize";
import { computeHistogram } from "@/modules/ocr/preprocessing/histogram";
import { computeOtsuThreshold, otsuBinarization } from "@/modules/ocr/preprocessing/otsu-binarization";
import { denoise } from "@/modules/ocr/preprocessing/denoise";
import { createImageData } from "@/modules/ocr/preprocessing/create-image-data";
import { ensureTextIsForeground } from "@/modules/ocr/segmentation/normalize-polarity";
import { findConnectedComponents, type Component } from "@/modules/ocr/segmentation/connected-components";
import { extractLines, type LineRegion } from "@/modules/ocr/segmentation/extract-lines";
import { extractWordsFromLine, type WordRegion } from "@/modules/ocr/segmentation/extract-words";
import { extractCharactersFromWord, type CharacterRegion } from "@/modules/ocr/segmentation/extract-characters";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";

const HISTOGRAM_CANVAS_HEIGHT = 120;
const COMPONENT_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f97316", "#a855f7", "#06b6d4", "#eab308"];

interface SegmentationResult {
  components: Component[];
  lines: LineRegion[];
  words: WordRegion[];
  characters: CharacterRegion[];
}

function drawImageDataToCanvas(canvas: HTMLCanvasElement | null, imageData: ImageData) {
  if (!canvas) return;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx?.putImageData(imageData, 0, 0);
}

function drawHistogram(canvas: HTMLCanvasElement | null, histogram: number[]) {
  if (!canvas) return;
  canvas.width = 256;
  canvas.height = HISTOGRAM_CANVAS_HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const max = Math.max(...histogram, 1);
  ctx.fillStyle = "#525252";
  for (let i = 0; i < 256; i++) {
    const barHeight = (histogram[i] / max) * HISTOGRAM_CANVAS_HEIGHT;
    ctx.fillRect(i, HISTOGRAM_CANVAS_HEIGHT - barHeight, 1, barHeight);
  }
}

/** Dibuja la imagen base + bounding boxes de componentes (colores por id) + líneas (horizontal) + palabras (vertical, por línea). */
function drawSegmentationOverlay(
  canvas: HTMLCanvasElement | null,
  imageData: ImageData,
  result: SegmentationResult,
) {
  if (!canvas) return;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.putImageData(imageData, 0, 0);

  ctx.lineWidth = 1;
  for (const component of result.components) {
    ctx.strokeStyle = COMPONENT_COLORS[component.id % COMPONENT_COLORS.length];
    const { x, y, width, height } = component.boundingBox;
    ctx.strokeRect(x + 0.5, y + 0.5, width, height);
  }

  ctx.strokeStyle = "#0ea5e9";
  ctx.lineWidth = 1;
  for (const line of result.lines) {
    ctx.beginPath();
    ctx.moveTo(0, line.yStart + 0.5);
    ctx.lineTo(canvas.width, line.yStart + 0.5);
    ctx.moveTo(0, line.yEnd + 0.5);
    ctx.lineTo(canvas.width, line.yEnd + 0.5);
    ctx.stroke();
  }

  ctx.strokeStyle = "#f59e0b";
  for (const word of result.words) {
    ctx.beginPath();
    ctx.moveTo(word.xStart + 0.5, word.yStart);
    ctx.lineTo(word.xStart + 0.5, word.yEnd);
    ctx.moveTo(word.xEnd + 0.5, word.yStart);
    ctx.lineTo(word.xEnd + 0.5, word.yEnd);
    ctx.stroke();
  }
}

export function OcrPreviewClient() {
  const originalCanvasRef = useRef<HTMLCanvasElement>(null);
  const currentCanvasRef = useRef<HTMLCanvasElement>(null);
  const histogramCanvasRef = useRef<HTMLCanvasElement>(null);

  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [currentImage, setCurrentImage] = useState<ImageData | null>(null);
  const [appliedSteps, setAppliedSteps] = useState<string[]>([]);
  const [otsuThreshold, setOtsuThreshold] = useState<number | null>(null);
  const [kernelSize, setKernelSize] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null);
  const [normalizedCharacters, setNormalizedCharacters] = useState<ImageData[] | null>(null);

  useEffect(() => {
    if (originalImage) drawImageDataToCanvas(originalCanvasRef.current, originalImage);
  }, [originalImage]);

  useEffect(() => {
    if (!currentImage) return;
    drawHistogram(histogramCanvasRef.current, computeHistogram(currentImage).histogram);
    if (segmentation) {
      drawSegmentationOverlay(currentCanvasRef.current, currentImage, segmentation);
    } else {
      drawImageDataToCanvas(currentCanvasRef.current, currentImage);
    }
  }, [currentImage, segmentation]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setLoading(true);
    try {
      const imageData = await decodeImage(file);
      setOriginalImage(imageData);
      setCurrentImage(imageData);
      setAppliedSteps([]);
      setOtsuThreshold(null);
      setSegmentation(null);
      setNormalizedCharacters(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la imagen.");
    } finally {
      setLoading(false);
    }
  }

  function applyStep(name: string, fn: (img: ImageData) => ImageData) {
    if (!currentImage) return;
    setCurrentImage(fn(currentImage));
    setAppliedSteps((prev) => [...prev, name]);
    setSegmentation(null);
    setNormalizedCharacters(null);
  }

  function handleGrayscale() {
    applyStep("Grayscale", toGrayscale);
  }

  function handleNormalize() {
    applyStep("Normalizar", normalizeRange);
  }

  function handleOtsu() {
    if (!currentImage) return;
    setOtsuThreshold(computeOtsuThreshold(currentImage));
    applyStep("Otsu", otsuBinarization);
  }

  function handleDenoise() {
    applyStep(`Denoise (kernel ${kernelSize})`, (img) => denoise(img, kernelSize));
  }

  function handleSegment() {
    if (!currentImage) return;
    // ensureTextIsForeground no se cuenta como "paso aplicado" visible al
    // usuario (no cambia el binarizado en sí para la mayoría de imágenes,
    // solo corrige polaridad si hace falta) -- pero sí determina qué canal
    // segmentation usa de aquí en adelante.
    const foreground = ensureTextIsForeground(currentImage);
    const components = findConnectedComponents(foreground);
    const lines = extractLines(foreground, components);
    const words = lines.flatMap((line) => extractWordsFromLine(line));
    const characters = words.flatMap((word) => extractCharactersFromWord(word));

    setSegmentation({ components, lines, words, characters });
    setNormalizedCharacters(null);
    setAppliedSteps((prev) => [...prev, "Segmentar"]);
  }

  function handleNormalizeCharacters() {
    if (!segmentation) return;
    setNormalizedCharacters(segmentation.characters.map((c) => normalizeCharacter(c)));
  }

  function handleReset() {
    if (!originalImage) return;
    setCurrentImage(originalImage);
    setAppliedSteps([]);
    setOtsuThreshold(null);
    setSegmentation(null);
    setNormalizedCharacters(null);
  }

  function handleDownload() {
    const canvas = currentCanvasRef.current;
    if (!canvas) return;
    const link = document.createElement("a");
    link.href = canvas.toDataURL("image/png");
    link.download = "ocr-preview-procesada.png";
    link.click();
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Imagen de prueba (JPG o PNG)
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChange}
          className="rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </label>

      {loading ? (
        <p className="text-sm text-neutral-600 dark:text-neutral-400">Decodificando...</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {originalImage ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={handleGrayscale} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
              Grayscale
            </button>
            <button type="button" onClick={handleNormalize} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
              Normalizar
            </button>
            <button type="button" onClick={handleOtsu} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
              Otsu
            </button>
            <label className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
              kernel
              <input
                type="number"
                min={3}
                step={2}
                value={kernelSize}
                onChange={(e) => setKernelSize(Math.max(3, Number(e.target.value) || 3))}
                className="w-14 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <button type="button" onClick={handleDenoise} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
              Denoise
            </button>
            <button type="button" onClick={handleSegment} className="rounded-md border border-sky-500 px-3 py-2 text-sm font-medium text-sky-700 dark:border-sky-400 dark:text-sky-300">
              Segmentar
            </button>
            <button type="button" onClick={handleReset} className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
              Reiniciar
            </button>
            <button type="button" onClick={handleDownload} className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-50 dark:text-neutral-900">
              Descargar PNG
            </button>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Pasos aplicados: {appliedSteps.length ? appliedSteps.join(" → ") : "ninguno todavía"}
            {otsuThreshold !== null ? ` — threshold de Otsu: ${otsuThreshold}` : ""}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">Original</p>
              <canvas ref={originalCanvasRef} className="w-full rounded-md border border-neutral-200 dark:border-neutral-800" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Procesada {segmentation ? "(con bounding boxes: rojo/azul/verde... = componentes, celeste = líneas, ámbar = palabras)" : ""}
              </p>
              <canvas ref={currentCanvasRef} className="w-full rounded-md border border-neutral-200 dark:border-neutral-800" />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Histograma (imagen procesada actual)
            </p>
            <canvas ref={histogramCanvasRef} className="w-full rounded-md border border-neutral-200 bg-white dark:border-neutral-800" />
          </div>

          {segmentation ? (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                  {segmentation.lines.length} línea(s), {segmentation.words.length} palabra(s),{" "}
                  {segmentation.characters.length} carácter(es) segmentado(s)
                </p>
                <button
                  type="button"
                  onClick={handleNormalizeCharacters}
                  className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
                >
                  Normalizar caracteres
                </button>
              </div>

              <div className="flex flex-wrap gap-2 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
                {(normalizedCharacters ?? segmentation.characters.map((c) => createImageData(c.pixels, c.width, c.height))).map(
                  (img, i) => (
                    <CharacterThumbnail key={i} imageData={img} />
                  ),
                )}
                {segmentation.characters.length === 0 ? (
                  <p className="text-sm text-neutral-500 dark:text-neutral-400">
                    No se encontraron caracteres — revisa que la imagen esté binarizada
                    (Otsu) antes de segmentar.
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function CharacterThumbnail({ imageData }: { imageData: ImageData }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    drawImageDataToCanvas(ref.current, imageData);
  }, [imageData]);

  return (
    <canvas
      ref={ref}
      className="h-10 w-10 rounded border border-neutral-300 bg-black dark:border-neutral-700"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
