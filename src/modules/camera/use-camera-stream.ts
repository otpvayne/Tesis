"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { checkCameraAvailability } from "@/modules/camera/availability";
import { classifyCameraError } from "@/modules/camera/errors";
import type { CameraError } from "@/modules/camera/types";

export interface UseCameraStreamResult {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  error: CameraError | null;
  isActive: boolean;
  isStarting: boolean;
  start: () => Promise<void>;
  stop: () => void;
}

/**
 * Maneja el ciclo de vida completo del `MediaStream` de la cámara:
 * solicitud de permiso, preview en el `<video>`, y liberación de los
 * tracks. No es testeable con jsdom (no hay implementación real de
 * `getUserMedia`/`<video>` ahí) — queda pendiente de verificación manual
 * en dispositivo real (ver docs/requirements/traceability.md, Fase 3).
 */
export function useCameraStream(): UseCameraStreamResult {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [error, setError] = useState<CameraError | null>(null);
  const [isActive, setIsActive] = useState(false);
  const [isStarting, setIsStarting] = useState(false);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);

    const availabilityError = checkCameraAvailability({
      hasMediaDevices:
        typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
      isSecureContext: typeof window !== "undefined" && window.isSecureContext,
    });
    if (availabilityError) {
      setError(availabilityError);
      return;
    }

    setIsStarting(true);
    try {
      // `ideal` (no `exact`): preferir cámara trasera sin romper en
      // dispositivos con una sola cámara (frontal), como pide RF-001/RNF-007.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
    } catch (err) {
      setError(classifyCameraError(err));
    } finally {
      setIsStarting(false);
    }
  }, []);

  // Libera la cámara sin importar cómo se salga de la pantalla de captura
  // (confirmar, cancelar, o navegar fuera) — nunca dejarla encendida en
  // segundo plano.
  useEffect(() => {
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo debe correr en unmount
  }, []);

  return { videoRef, error, isActive, isStarting, start, stop };
}
