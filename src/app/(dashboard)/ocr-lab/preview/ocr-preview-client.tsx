"use client";

import { useEffect, useRef, useState } from "react";
import { decodeImage } from "@/modules/ocr/preprocessing/decode-image";
import { toGrayscale } from "@/modules/ocr/preprocessing/grayscale";
import { normalizeRange } from "@/modules/ocr/preprocessing/normalize";
import { computeHistogram } from "@/modules/ocr/preprocessing/histogram";
import { computeOtsuThreshold, otsuBinarization } from "@/modules/ocr/preprocessing/otsu-binarization";
import { denoise } from "@/modules/ocr/preprocessing/denoise";

const HISTOGRAM_CANVAS_HEIGHT = 120;

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

  useEffect(() => {
    if (originalImage) drawImageDataToCanvas(originalCanvasRef.current, originalImage);
  }, [originalImage]);

  useEffect(() => {
    if (currentImage) {
      drawImageDataToCanvas(currentCanvasRef.current, currentImage);
      drawHistogram(histogramCanvasRef.current, computeHistogram(currentImage).histogram);
    }
  }, [currentImage]);

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

  function handleReset() {
    if (!originalImage) return;
    setCurrentImage(originalImage);
    setAppliedSteps([]);
    setOtsuThreshold(null);
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
            <button
              type="button"
              onClick={handleGrayscale}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Grayscale
            </button>
            <button
              type="button"
              onClick={handleNormalize}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Normalizar
            </button>
            <button
              type="button"
              onClick={handleOtsu}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
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
            <button
              type="button"
              onClick={handleDenoise}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Denoise
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="rounded-md border border-neutral-300 px-3 py-2 text-sm text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Reiniciar
            </button>
            <button
              type="button"
              onClick={handleDownload}
              className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white dark:bg-neutral-50 dark:text-neutral-900"
            >
              Descargar PNG
            </button>
          </div>

          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Pasos aplicados: {appliedSteps.length ? appliedSteps.join(" → ") : "ninguno todavía"}
            {otsuThreshold !== null ? ` — threshold de Otsu: ${otsuThreshold}` : ""}
          </p>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Original
              </p>
              <canvas
                ref={originalCanvasRef}
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-800"
              />
            </div>
            <div className="flex flex-col gap-1">
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
                Procesada
              </p>
              <canvas
                ref={currentCanvasRef}
                className="w-full rounded-md border border-neutral-200 dark:border-neutral-800"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-neutral-500 dark:text-neutral-400">
              Histograma (imagen procesada actual)
            </p>
            <canvas
              ref={histogramCanvasRef}
              className="w-full rounded-md border border-neutral-200 bg-white dark:border-neutral-800"
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
