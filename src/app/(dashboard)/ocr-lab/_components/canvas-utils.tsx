"use client";

import { useEffect, useRef } from "react";

/** Compartido entre `/ocr-lab/preview` y `/ocr-lab/train` — dibuja un `ImageData` tal cual en un canvas. */
export function drawImageDataToCanvas(canvas: HTMLCanvasElement | null, imageData: ImageData) {
  if (!canvas) return;
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d");
  ctx?.putImageData(imageData, 0, 0);
}

/**
 * `className` es opcional (por defecto el thumbnail pequeño de siempre,
 * `h-8 w-8`) — se agregó para poder reusar el mismo componente en la vista
 * "en foco" ampliada del flujo de etiquetado por teclado
 * (`ocr-train-client.tsx`), donde 32px reales es demasiado pequeño para
 * distinguir a simple vista glifos ambiguos (`I`/`l`, `O`/`0`, `S`/`5`) que
 * si se etiquetan mal contaminan el dataset silenciosamente.
 */
export function CharacterThumbnail({
  imageData,
  className = "h-8 w-8 rounded border border-neutral-300 bg-black dark:border-neutral-700",
}: {
  imageData: ImageData;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    drawImageDataToCanvas(ref.current, imageData);
  }, [imageData]);

  return <canvas ref={ref} className={className} style={{ imageRendering: "pixelated" }} />;
}
