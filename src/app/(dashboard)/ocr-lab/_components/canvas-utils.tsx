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

export function CharacterThumbnail({ imageData }: { imageData: ImageData }) {
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
