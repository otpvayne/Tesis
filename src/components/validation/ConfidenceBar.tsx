"use client";

import { useEffect, useState } from "react";
import { computeConfidenceLevel } from "@/modules/documents/validation-logic";

export interface ConfidenceBarProps {
  /** 0-1, mismo rango que el confidence real del pipeline OCR (nunca 0-100). */
  confidence: number;
  showLabel?: boolean;
  size?: "sm" | "md";
}

const HEIGHT_CLASSES = { sm: "h-1.5", md: "h-2.5" };

/**
 * Componente signature del sistema de diseño: barra de confianza con
 * gradiente rojo→ámbar→verde a lo largo de todo el ancho de la pista, no
 * solo un color plano — el relleno revela únicamente el tramo del
 * degradado hasta el punto de confianza real (truco de `background-size`:
 * el degradado se dibuja al ancho completo de la pista, el relleno lo
 * "recorta" a su propio ancho), así que un 20% de confianza se ve
 * claramente rojizo y un 90% se ve casi todo verde — el color no es solo
 * una decisión discreta de 3 valores, es continuo.
 *
 * Anima su ancho de 0 al valor real al montar (una sola vez) — respeta
 * `prefers-reduced-motion` automáticamente vía la regla global en
 * `src/styles/theme.css` (fuerza `transition-duration` casi a 0), no hace
 * falta condicionarlo aquí.
 */
export function ConfidenceBar({ confidence, showLabel = true, size = "md" }: ConfidenceBarProps) {
  const clamped = Math.min(1, Math.max(0, confidence));
  const [width, setWidth] = useState(0);

  useEffect(() => {
    // Un frame en 0% antes de animar a clamped% -- si se setea directo al
    // montar, el navegador puede saltarse la transición (no hay "antes" que
    // interpolar).
    const raf = requestAnimationFrame(() => setWidth(clamped * 100));
    return () => cancelAnimationFrame(raf);
  }, [clamped]);

  const level = computeConfidenceLevel(clamped);
  const levelLabel = { high: "alta", medium: "media", low: "baja" }[level];
  // Evita división por 0 en el cálculo de background-size cuando confidence es exactamente 0.
  const backgroundSizePercent = 100 / Math.max(width, 1);

  return (
    <div className="flex flex-col gap-1">
      <div
        className={`w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800 ${HEIGHT_CLASSES[size]}`}
        role="progressbar"
        aria-valuenow={Math.round(clamped * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Confianza ${levelLabel}`}
      >
        <div
          className="h-full rounded-full transition-[width] duration-700 ease-signature"
          style={{
            width: `${width}%`,
            backgroundImage: "linear-gradient(to right, var(--color-critical-500), var(--color-caution-500), var(--color-brand-600))",
            backgroundSize: `${backgroundSizePercent}% 100%`,
          }}
        />
      </div>
      {showLabel ? (
        <span className="font-data text-xs text-neutral-500 dark:text-neutral-400">{(clamped * 100).toFixed(0)}% de confianza ({levelLabel})</span>
      ) : null}
    </div>
  );
}
