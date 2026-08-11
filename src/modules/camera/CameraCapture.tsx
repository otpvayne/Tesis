"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCameraStream } from "@/modules/camera/use-camera-stream";
import { validateCaptureResolution } from "@/modules/camera/resolution";

export interface CameraCaptureProps {
  /** Se llama con el archivo ya listo (JPEG) cuando el usuario confirma la foto. */
  onConfirm: (file: File) => void;
  /** Se llama al cancelar o cuando la cámara no está disponible — el padre debe mostrar el fallback de selección manual. */
  onCancel: () => void;
}

/**
 * UI de captura mobile-first: solicita la cámara al montarse, muestra el
 * preview en vivo, permite capturar/repetir, y libera el `MediaStream` al
 * confirmar, cancelar, o desmontarse (vía useCameraStream). No hay forma
 * de probar esto automatizado sin un navegador real (RNF-007) — queda
 * pendiente de verificación manual del equipo en dispositivo real.
 */
export function CameraCapture({ onConfirm, onCancel }: CameraCaptureProps) {
  const { videoRef, error, isActive, isStarting, start, stop } = useCameraStream();
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);

  useEffect(() => {
    void start();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al montar
  }, []);

  // URL de objeto derivada del blob capturado (no estado propio): así el
  // efecto de abajo solo se encarga de liberarla, nunca de setState.
  const previewUrl = useMemo(
    () => (capturedBlob ? URL.createObjectURL(capturedBlob) : null),
    [capturedBlob],
  );

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const handleCapture = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const width = video.videoWidth;
    const height = video.videoHeight;

    const resolutionCheck = validateCaptureResolution(width, height);
    if (!resolutionCheck.ok) {
      setCaptureError(resolutionCheck.reason ?? "La imagen capturada es muy pequeña.");
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setCaptureError("No se pudo procesar la imagen capturada.");
      return;
    }
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setCaptureError("No se pudo procesar la imagen capturada.");
          return;
        }
        setCaptureError(null);
        setCapturedBlob(blob);
      },
      "image/jpeg",
      0.92,
    );
  }, [videoRef]);

  const handleRetake = useCallback(() => {
    setCapturedBlob(null);
    setCaptureError(null);
  }, []);

  const handleConfirm = useCallback(() => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `captura-${Date.now()}.jpg`, { type: "image/jpeg" });
    stop();
    onConfirm(file);
  }, [capturedBlob, onConfirm, stop]);

  const handleCancel = useCallback(() => {
    stop();
    onCancel();
  }, [stop, onCancel]);

  if (error) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          Seleccionar imagen manualmente
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-900">
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview local desde un blob recién capturado, no una URL remota
          <img
            src={previewUrl}
            alt="Foto capturada"
            className="h-full w-full object-cover"
          />
        ) : (
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="h-full w-full object-cover"
          />
        )}
        {isStarting ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-200">
            Activando cámara...
          </p>
        ) : null}
      </div>

      {captureError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {captureError}
        </p>
      ) : null}

      <div className="flex gap-3">
        {capturedBlob ? (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 rounded-md border border-neutral-300 px-4 py-3 text-base font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Repetir foto
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="flex-1 rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white dark:bg-neutral-50 dark:text-neutral-900"
            >
              Usar esta foto
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-md border border-neutral-300 px-4 py-3 text-base font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleCapture}
              disabled={!isActive}
              className="flex-1 rounded-md bg-neutral-900 px-4 py-3 text-base font-medium text-white disabled:opacity-60 dark:bg-neutral-50 dark:text-neutral-900"
            >
              Capturar
            </button>
          </>
        )}
      </div>
    </div>
  );
}
