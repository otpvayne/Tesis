"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCameraStream } from "@/modules/camera/use-camera-stream";
import { validateCaptureResolution } from "@/modules/camera/resolution";

export interface CameraCaptureProps {
  /** Se llama con el archivo ya listo (JPEG) cuando el usuario confirma la foto. */
  onConfirm: (file: File) => void;
  /** Se llama al cancelar sin ninguna foto capturada, o cuando la cámara no está disponible — el padre debe mostrar el fallback de selección manual. */
  onCancel: () => void;
}

/**
 * UI de captura mobile-first: solicita la cámara al montarse, muestra el
 * preview en vivo, permite capturar/repetir/cancelar, y libera el
 * `MediaStream` al confirmar, cancelar sin foto, o desmontarse (vía
 * useCameraStream). No hay forma de probar esto automatizado sin un
 * navegador real (RNF-007) — queda pendiente de verificación manual del
 * equipo en dispositivo real.
 *
 * El `<video>` se mantiene SIEMPRE montado (nunca se reemplaza por un
 * `<img>` vía ternario) — la foto capturada se muestra como overlay
 * encima. La versión anterior intercambiaba `<video>`/`<img>` según había
 * o no una foto capturada, lo que desmontaba el elemento `<video>` al
 * mostrar el preview; al volver a la vista en vivo ("Repetir foto") se
 * montaba un `<video>` nuevo cuyo `srcObject` nunca se reasignaba, dejando
 * la pantalla en negro — encontrado en testing real (Android), no
 * detectable en jsdom.
 */
export function CameraCapture({ onConfirm, onCancel }: CameraCaptureProps) {
  const { videoRef, error, isActive, isStarting, start, stop } = useCameraStream();
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  // true = intentando conseguir una foto NUEVA (vista en vivo); false =
  // mostrando la última foto capturada. Empieza en true porque al montar
  // todavía no hay ninguna foto. Se mantiene aparte de `capturedBlob` para
  // poder "retomar" sin perder la foto anterior si el reintento falla.
  const [isRetaking, setIsRetaking] = useState(true);

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
        setIsRetaking(false);
      },
      "image/jpeg",
      0.92,
    );
  }, [videoRef]);

  // Sirve tanto para "Repetir foto" (sin error, stream ya activo) como
  // para "Retomar captura" tras un error (stream caído: hay que pedirlo
  // de nuevo). En ambos casos NO se descarta capturedBlob todavía — si el
  // reintento también falla, el usuario sigue teniendo su foto anterior
  // disponible en vez de quedarse sin nada.
  const handleRetake = useCallback(() => {
    setCaptureError(null);
    setIsRetaking(true);
    if (!isActive) {
      void start();
    }
  }, [isActive, start]);

  const handleConfirm = useCallback(() => {
    if (!capturedBlob) return;
    const file = new File([capturedBlob], `captura-${Date.now()}.jpg`, { type: "image/jpeg" });
    stop();
    onConfirm(file);
  }, [capturedBlob, onConfirm, stop]);

  // "Cancelar" desde la vista en vivo: si ya hay una foto capturada de un
  // intento anterior, volver a mostrarla en vez de salir del todo (eso es
  // lo que pedía el bug real: "cancelar" no debe perder la última foto).
  // Solo se sale al fallback del padre cuando NO hay ninguna foto de
  // respaldo.
  const handleCancelLiveView = useCallback(() => {
    if (capturedBlob) {
      setIsRetaking(false);
      return;
    }
    stop();
    onCancel();
  }, [capturedBlob, stop, onCancel]);

  const handleErrorCancel = useCallback(() => {
    stop();
    onCancel();
  }, [stop, onCancel]);

  // Solo es un error "sin salida" cuando tampoco hay una foto de respaldo
  // que ofrecer — si ya se capturó algo antes de que el stream fallara,
  // se sigue pudiendo usar esa foto (ver comentario de clase arriba).
  if (error && !capturedBlob) {
    return (
      <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm text-red-600 dark:text-red-400">{error.message}</p>
        <button
          type="button"
          onClick={handleErrorCancel}
          className="rounded-md border border-neutral-300 px-4 py-3 text-sm font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
        >
          Seleccionar imagen manualmente
        </button>
      </div>
    );
  }

  // Mostrar la foto capturada cuando no se está intentando una nueva, o
  // cuando sí se está intentando pero el reintento falló (error presente).
  const showingCapturedPreview = capturedBlob !== null && (!isRetaking || !!error);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-md bg-neutral-900">
        <video ref={videoRef} autoPlay playsInline muted className="h-full w-full object-cover" />
        {showingCapturedPreview && previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- preview local desde un blob recién capturado, no una URL remota
          <img
            src={previewUrl}
            alt="Foto capturada"
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : null}
        {isStarting ? (
          <p className="absolute inset-0 flex items-center justify-center text-sm text-neutral-200">
            Activando cámara...
          </p>
        ) : null}
      </div>

      {error && capturedBlob ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error.message} Puedes seguir usando la foto que ya tomaste.
        </p>
      ) : null}

      {captureError ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {captureError}
        </p>
      ) : null}

      <div className="flex gap-3">
        {showingCapturedPreview ? (
          <>
            <button
              type="button"
              onClick={handleRetake}
              className="flex-1 rounded-md border border-neutral-300 px-4 py-3 text-base font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200"
            >
              Retomar captura
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
              onClick={handleCancelLiveView}
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
