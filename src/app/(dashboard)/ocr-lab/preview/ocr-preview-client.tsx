"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { decodeImage } from "@/modules/ocr/preprocessing/decode-image";
import { toGrayscale } from "@/modules/ocr/preprocessing/grayscale";
import { normalizeRange } from "@/modules/ocr/preprocessing/normalize";
import { computeHistogram } from "@/modules/ocr/preprocessing/histogram";
import { computeOtsuThreshold, otsuBinarization } from "@/modules/ocr/preprocessing/otsu-binarization";
import { gaussianBlur } from "@/modules/ocr/preprocessing/gaussian-blur";
import { denoise } from "@/modules/ocr/preprocessing/denoise";
import { ensureTextIsForeground } from "@/modules/ocr/segmentation/normalize-polarity";
import { findConnectedComponents, type Component } from "@/modules/ocr/segmentation/connected-components";
import { computeProjections } from "@/modules/ocr/segmentation/projections";
import { extractLines, type LineRegion } from "@/modules/ocr/segmentation/extract-lines";
import { extractWordsFromLine, type WordRegion } from "@/modules/ocr/segmentation/extract-words";
import { extractCharactersFromWord, type CharacterRegion } from "@/modules/ocr/segmentation/extract-characters";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";
import { OCR_CONFIG } from "@/modules/ocr/config";

const HISTOGRAM_CANVAS_HEIGHT = 120;
const COMPONENT_COLORS = ["#ef4444", "#3b82f6", "#22c55e", "#f97316", "#a855f7", "#06b6d4", "#eab308"];

/** Paso más avanzado del pipeline aplicado sobre la imagen actual — gate visual, no persiste nada. */
type PipelineStep = "none" | "grayscale" | "normalized" | "blurred" | "otsu" | "denoised" | "segmented";

interface SegmentationResult {
  components: Component[];
  lines: LineRegion[];
  words: WordRegion[];
  characters: CharacterRegion[];
}

/**
 * Diagnóstico de la proyección horizontal + polaridad, calculado sobre la
 * misma imagen (`ensureTextIsForeground(currentImage)`) que usa realmente
 * `handleSegment` — para poder comparar, sin adivinar, si un resultado de
 * segmentación pobre viene de: (a) la binarización de Otsu (casi toda la
 * imagen de un solo color), (b) la corrección de polaridad invirtiendo
 * cuando no debía (o al revés), o (c) el threshold de valle / extractLines
 * en sí, una vez que ya se sabe que (a) y (b) están bien.
 */
interface DebugStats {
  totalPixels: number;
  rawWhiteCount: number;
  foregroundWhiteCount: number;
  wasPolarityInverted: boolean;
  extremeSkew: boolean;
  horizontal: number[];
  valleyRows: number;
  textRows: number;
  lineRunsFromProjection: number;
}

function computeDebugStats(currentImage: ImageData): DebugStats {
  const totalPixels = currentImage.width * currentImage.height;

  let rawWhiteCount = 0;
  for (let i = 0; i < currentImage.data.length; i += 4) {
    if (currentImage.data[i] === 255) rawWhiteCount++;
  }

  const foreground = ensureTextIsForeground(currentImage);
  let foregroundWhiteCount = 0;
  for (let i = 0; i < foreground.data.length; i += 4) {
    if (foreground.data[i] === 255) foregroundWhiteCount++;
  }
  const wasPolarityInverted = foregroundWhiteCount !== rawWhiteCount;
  const foregroundBlackCount = totalPixels - foregroundWhiteCount;
  const extremeSkew = foregroundWhiteCount / totalPixels > 0.98 || foregroundBlackCount / totalPixels > 0.98;

  const projections = computeProjections(foreground);
  const threshold = OCR_CONFIG.HORIZONTAL_VALLEY_THRESHOLD;
  const valleyRows = projections.horizontal.filter((count) => count < threshold).length;
  const textRows = projections.horizontal.length - valleyRows;
  const lineRunsFromProjection = extractLines(foreground, [], projections).length;

  return {
    totalPixels,
    rawWhiteCount,
    foregroundWhiteCount,
    wasPolarityInverted,
    extremeSkew,
    horizontal: projections.horizontal,
    valleyRows,
    textRows,
    lineRunsFromProjection,
  };
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

const PROJECTION_CHART_WIDTH = 220;

/**
 * Dibuja `horizontal[y]` como una barra horizontal por fila (una fila de
 * canvas = una fila de la imagen, para que la altura del gráfico coincida
 * visualmente con el bloque de texto). Azul = fila de texto
 * (`horizontal[y] >= threshold`), rojo = valle. La línea vertical marca la
 * posición del threshold en la escala del eje X (0..max píxeles/fila).
 */
function drawHorizontalProjectionDebug(canvas: HTMLCanvasElement | null, horizontal: number[], threshold: number) {
  if (!canvas || horizontal.length === 0) return;
  canvas.width = PROJECTION_CHART_WIDTH;
  canvas.height = horizontal.length;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const max = Math.max(...horizontal, 1);

  for (let y = 0; y < horizontal.length; y++) {
    const isTextRow = horizontal[y] >= threshold;
    const barLength = Math.max(1, (horizontal[y] / max) * PROJECTION_CHART_WIDTH);
    ctx.fillStyle = isTextRow ? "#0ea5e9" : "#ef4444";
    ctx.fillRect(0, y, barLength, 1);
  }

  const thresholdX = (threshold / max) * PROJECTION_CHART_WIDTH;
  ctx.strokeStyle = "#000000";
  ctx.globalAlpha = 0.5;
  ctx.beginPath();
  ctx.moveTo(thresholdX, 0);
  ctx.lineTo(thresholdX, canvas.height);
  ctx.stroke();
  ctx.globalAlpha = 1;
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
  const originalHistogramCanvasRef = useRef<HTMLCanvasElement>(null);
  const currentHistogramCanvasRef = useRef<HTMLCanvasElement>(null);
  const debugProjectionCanvasRef = useRef<HTMLCanvasElement>(null);

  const [originalImage, setOriginalImage] = useState<ImageData | null>(null);
  const [currentImage, setCurrentImage] = useState<ImageData | null>(null);
  const [appliedSteps, setAppliedSteps] = useState<string[]>([]);
  const [step, setStep] = useState<PipelineStep>("none");
  const [otsuThreshold, setOtsuThreshold] = useState<number | null>(null);
  const [thresholdMultiplier, setThresholdMultiplier] = useState(1);
  const [blurSigma, setBlurSigma] = useState(1);
  const [kernelSize, setKernelSize] = useState(3);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null);
  const [normalizedCharacters, setNormalizedCharacters] = useState<ImageData[] | null>(null);

  // Solo tiene sentido una vez la imagen está binarizada (Otsu ya
  // aplicado) — antes de eso "píxeles blancos" no significa "texto".
  const debugStats = useMemo<DebugStats | null>(() => {
    if (!currentImage || (step !== "otsu" && step !== "denoised" && step !== "segmented")) {
      return null;
    }
    return computeDebugStats(currentImage);
  }, [currentImage, step]);

  useEffect(() => {
    if (!originalImage) return;
    drawImageDataToCanvas(originalCanvasRef.current, originalImage);
    drawHistogram(originalHistogramCanvasRef.current, computeHistogram(originalImage).histogram);
  }, [originalImage]);

  useEffect(() => {
    if (!currentImage) return;
    drawHistogram(currentHistogramCanvasRef.current, computeHistogram(currentImage).histogram);
    if (segmentation) {
      drawSegmentationOverlay(currentCanvasRef.current, currentImage, segmentation);
    } else {
      drawImageDataToCanvas(currentCanvasRef.current, currentImage);
    }
  }, [currentImage, segmentation]);

  useEffect(() => {
    if (!debugStats) return;
    drawHorizontalProjectionDebug(debugProjectionCanvasRef.current, debugStats.horizontal, OCR_CONFIG.HORIZONTAL_VALLEY_THRESHOLD);
  }, [debugStats]);

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
      setStep("none");
      setOtsuThreshold(null);
      setSegmentation(null);
      setNormalizedCharacters(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la imagen.");
    } finally {
      setLoading(false);
    }
  }

  function applyStep(name: string, nextStep: PipelineStep, fn: (img: ImageData) => ImageData) {
    if (!currentImage) return;
    setCurrentImage(fn(currentImage));
    setAppliedSteps((prev) => [...prev, name]);
    setStep(nextStep);
    setSegmentation(null);
    setNormalizedCharacters(null);
  }

  function handleGrayscale() {
    applyStep("Grayscale", "grayscale", toGrayscale);
  }

  function handleNormalize() {
    applyStep("Normalizar", "normalized", normalizeRange);
  }

  function handleBlur() {
    applyStep(`Blur (σ=${blurSigma})`, "blurred", (img) => gaussianBlur(img, blurSigma));
  }

  function handleOtsu() {
    if (!currentImage) return;
    setOtsuThreshold(computeOtsuThreshold(currentImage));
    applyStep(
      thresholdMultiplier === 1 ? "Otsu" : `Otsu (×${thresholdMultiplier})`,
      "otsu",
      (img) => otsuBinarization(img, undefined, thresholdMultiplier),
    );
  }

  function handleDenoise() {
    applyStep(`Denoise (kernel ${kernelSize})`, "denoised", (img) => denoise(img, kernelSize));
  }

  function handleSegment() {
    if (!currentImage) return;
    // ensureTextIsForeground no se cuenta como "paso aplicado" visible al
    // usuario (no cambia el binarizado en sí para la mayoría de imágenes,
    // solo corrige polaridad si hace falta) -- pero sí determina qué canal
    // segmentation usa de aquí en adelante.
    const foreground = ensureTextIsForeground(currentImage);
    const projections = computeProjections(foreground);
    const components = findConnectedComponents(foreground);
    const lines = extractLines(foreground, components, projections);
    const words = lines.flatMap((line) => extractWordsFromLine(line));
    const characters = words.flatMap((word) => extractCharactersFromWord(word));
    const normalized = characters.map((character) => normalizeCharacter(character));

    setSegmentation({ components, lines, words, characters });
    setNormalizedCharacters(normalized);
    setAppliedSteps((prev) => [...prev, "Segmentar"]);
    setStep("segmented");
  }

  function handleReset() {
    if (!originalImage) return;
    setCurrentImage(originalImage);
    setAppliedSteps([]);
    setStep("none");
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
            <label
              className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400"
              title="Desviación estándar del kernel Gaussiano 3×3, aplicado antes de Otsu (sobre valores continuos, no binarios) para suavizar ruido de sensor/JPEG sin la erosión de trazos delgados que causaba denoise post-Otsu."
            >
              σ
              <input
                type="number"
                min={0.1}
                step={0.1}
                value={blurSigma}
                onChange={(e) => setBlurSigma(Math.max(0.1, Number(e.target.value) || 1))}
                className="w-14 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <button type="button" onClick={handleBlur} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
              Blur
            </button>
            <button type="button" onClick={handleOtsu} className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">
              Otsu
            </button>
            <label
              className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400"
              title="Multiplicador experimental sobre el threshold de Otsu (OCR_CONFIG no lo fija — se calibra a mano por imagen). 1 = sin ajuste."
            >
              threshold ×
              <input
                type="number"
                min={0.5}
                max={1.5}
                step={0.05}
                value={thresholdMultiplier}
                onChange={(e) => setThresholdMultiplier(Math.max(0.5, Math.min(1.5, Number(e.target.value) || 1)))}
                className="w-16 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <label className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
              kernel
              <input
                type="number"
                min={3}
                step={2}
                value={kernelSize}
                disabled={!OCR_CONFIG.APPLY_DENOISE}
                onChange={(e) => setKernelSize(Math.max(3, Number(e.target.value) || 3))}
                className="w-14 rounded-md border border-neutral-300 px-2 py-1 disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-950"
              />
            </label>
            <button
              type="button"
              onClick={handleDenoise}
              disabled={!OCR_CONFIG.APPLY_DENOISE}
              title={
                OCR_CONFIG.APPLY_DENOISE
                  ? undefined
                  : "Desactivado: OCR_CONFIG.APPLY_DENOISE = false (el kernel 3×3 erosiona trazos delgados, ver modules/ocr/preprocessing/denoise.ts)"
              }
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200"
            >
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
            {otsuThreshold !== null
              ? ` — threshold de Otsu: ${otsuThreshold}${
                  thresholdMultiplier !== 1 ? ` (ajustado ×${thresholdMultiplier} = ${Math.round(otsuThreshold * thresholdMultiplier)})` : ""
                }`
              : ""}
          </p>

          <div className="grid grid-cols-2 gap-2 rounded-md border border-neutral-200 p-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400 sm:grid-cols-5">
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Resolución actual</p>
              <p>{currentImage ? `${currentImage.width}×${currentImage.height}px` : "—"}</p>
            </div>
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Componentes</p>
              <p>{segmentation ? segmentation.components.length : "—"}</p>
            </div>
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Líneas</p>
              <p>{segmentation ? segmentation.lines.length : "—"}</p>
            </div>
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Palabras</p>
              <p>{segmentation ? segmentation.words.length : "—"}</p>
            </div>
            <div>
              <p className="font-medium text-neutral-500 dark:text-neutral-500">Caracteres</p>
              <p>{segmentation ? segmentation.characters.length : "—"}</p>
            </div>
          </div>

          {debugStats ? (
            <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Diagnóstico (sobre la imagen ya corregida por polaridad, la misma que usa Segmentar)
              </p>

              {debugStats.extremeSkew ? (
                <p role="alert" className="text-xs font-medium text-red-600 dark:text-red-400">
                  ⚠ {`>`}98% de los píxeles son de un solo color — la binarización de Otsu probablemente falló
                  (imagen casi sólida), no un problema de threshold de líneas.
                </p>
              ) : null}

              <div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 dark:text-neutral-400 sm:grid-cols-5">
                <div>
                  <p className="font-medium text-neutral-500 dark:text-neutral-500">
                    % ≥threshold / % {"<"}threshold (Otsu crudo, antes de polaridad)
                  </p>
                  <p>
                    {((debugStats.rawWhiteCount / debugStats.totalPixels) * 100).toFixed(1)}% /{" "}
                    {(100 - (debugStats.rawWhiteCount / debugStats.totalPixels) * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="font-medium text-neutral-500 dark:text-neutral-500">% blanco / % negro (ya corregido, = Segmentar)</p>
                  <p>
                    {((debugStats.foregroundWhiteCount / debugStats.totalPixels) * 100).toFixed(1)}% /{" "}
                    {(100 - (debugStats.foregroundWhiteCount / debugStats.totalPixels) * 100).toFixed(1)}%
                  </p>
                </div>
                <div>
                  <p className="font-medium text-neutral-500 dark:text-neutral-500">¿Polaridad invertida?</p>
                  <p>{debugStats.wasPolarityInverted ? "Sí (ensureTextIsForeground invirtió)" : "No"}</p>
                </div>
                <div>
                  <p className="font-medium text-neutral-500 dark:text-neutral-500">
                    Filas valle / texto (threshold={OCR_CONFIG.HORIZONTAL_VALLEY_THRESHOLD})
                  </p>
                  <p>
                    {debugStats.valleyRows} / {debugStats.textRows}
                  </p>
                </div>
                <div>
                  <p className="font-medium text-neutral-500 dark:text-neutral-500">
                    Líneas por proyección {segmentation ? "(vs. Segmentar)" : ""}
                  </p>
                  <p>
                    {debugStats.lineRunsFromProjection}
                    {segmentation ? ` vs ${segmentation.lines.length}` : ""}
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-[10px] text-neutral-500 dark:text-neutral-500">
                  Proyección horizontal por fila (azul = fila de texto, rojo = valle; la línea marca el threshold)
                </p>
                <div className="max-h-[70vh] w-fit overflow-y-auto rounded border border-neutral-200 bg-white dark:border-neutral-800">
                  <canvas ref={debugProjectionCanvasRef} style={{ width: PROJECTION_CHART_WIDTH, imageRendering: "pixelated" }} />
                </div>
              </div>
            </div>
          ) : null}

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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Histograma (imagen original)
              </p>
              <canvas ref={originalHistogramCanvasRef} className="w-full rounded-md border border-neutral-200 bg-white dark:border-neutral-800" />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Histograma (imagen procesada actual)
              </p>
              <canvas ref={currentHistogramCanvasRef} className="w-full rounded-md border border-neutral-200 bg-white dark:border-neutral-800" />
            </div>
          </div>

          {step === "segmented" && segmentation && normalizedCharacters ? (
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Caracteres normalizados ({OCR_CONFIG.CHAR_SIZE}×{OCR_CONFIG.CHAR_SIZE}px cada uno)
              </p>

              <div className="flex flex-wrap gap-3 rounded-md border border-neutral-200 p-2 dark:border-neutral-800">
                {segmentation.characters.map((character, i) => (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <CharacterThumbnail imageData={normalizedCharacters[i]} />
                    <span className="text-[10px] text-neutral-500 dark:text-neutral-400">
                      Char {i + 1}: {character.width}×{character.height}px → {OCR_CONFIG.CHAR_SIZE}×{OCR_CONFIG.CHAR_SIZE}px
                    </span>
                  </div>
                ))}
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
      className="h-8 w-8 rounded border border-neutral-300 bg-black dark:border-neutral-700"
      style={{ imageRendering: "pixelated" }}
    />
  );
}
