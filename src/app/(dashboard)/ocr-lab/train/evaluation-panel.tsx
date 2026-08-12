"use client";

import { useState, useTransition } from "react";
import { evaluateActiveModelOnTestPartition, type CharacterEvaluationResult } from "@/modules/ocr/classification/training-actions";

/**
 * Evaluación real (Fase 4f) del modelo **activo** contra la partición
 * `test` real de `ocr_training_samples` — nunca `train`/`validation`
 * (`CLAUDE.md` §7/§10). A diferencia del benchmark con datos sintéticos
 * de `docs/ocr/evaluation.md` (generado en esta sesión, sin acceso a
 * facturas reales), esto corre contra lo que el equipo haya etiquetado
 * de verdad en la sección de arriba — si `test` está vacío (probable
 * hasta que Andrés/Santiago etiqueten), lo dice explícitamente en vez de
 * fingir una métrica.
 */
export function EvaluationPanel() {
  const [result, setResult] = useState<CharacterEvaluationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluating, startEvaluating] = useTransition();

  function handleEvaluate() {
    setError(null);
    setResult(null);
    startEvaluating(async () => {
      try {
        const evaluation = await evaluateActiveModelOnTestPartition();
        setResult(evaluation);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo evaluar el modelo activo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">Evaluación del modelo activo (Fase 4f)</p>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Corre el modelo activo (<code>ocr_models</code>, <code>active=true</code>) contra la partición <code>test</code> real
          de <code>ocr_training_samples</code> — nunca <code>train</code>/<code>validation</code>. Necesita un modelo activado
          arriba y al menos una muestra guardada con partición <code>test</code>.
        </p>
      </div>

      <button
        type="button"
        onClick={handleEvaluate}
        disabled={isEvaluating}
        className="self-start rounded-md border border-sky-500 px-3 py-2 text-sm font-medium text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-400 dark:text-sky-300"
      >
        {isEvaluating ? "Evaluando..." : "Evaluar modelo activo sobre 'test'"}
      </button>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {result ? (
        <div className="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <p>
            Modelo: <code>{result.modelVersion}</code> — Accuracy:{" "}
            {(result.metrics.accuracy * 100).toFixed(1)}% ({result.metrics.correctCharacters}/{result.metrics.totalCharactersProcessed})
          </p>

          {result.metrics.commonMisclassifications.length > 0 ? (
            <div>
              <p className="text-xs font-medium text-neutral-500 dark:text-neutral-500">Confusiones más comunes:</p>
              <ul className="text-xs text-neutral-600 dark:text-neutral-400">
                {result.metrics.commonMisclassifications.map((m, i) => (
                  <li key={i}>
                    {m.actual} → {m.predicted}: {m.count} veces
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="max-h-64 max-w-full overflow-auto rounded border border-neutral-200 dark:border-neutral-800">
            <table className="border-collapse text-[10px]">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 border border-neutral-200 bg-neutral-100 px-1 dark:border-neutral-800 dark:bg-neutral-900">
                    real \ predicho
                  </th>
                  {result.metrics.labels.map((label) => (
                    <th key={label} className="sticky top-0 border border-neutral-200 bg-neutral-100 px-1 dark:border-neutral-800 dark:bg-neutral-900">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.metrics.confusionMatrix.map((row, i) => (
                  <tr key={result.metrics.labels[i]}>
                    <th className="sticky left-0 border border-neutral-200 bg-neutral-100 px-1 dark:border-neutral-800 dark:bg-neutral-900">
                      {result.metrics.labels[i]}
                    </th>
                    {row.map((count, j) => (
                      <td
                        key={j}
                        className="border border-neutral-200 px-1 text-center dark:border-neutral-800"
                        style={{
                          backgroundColor:
                            count > 0 ? (i === j ? `rgba(34,197,94,${Math.min(1, count / 5)})` : `rgba(239,68,68,${Math.min(1, count / 5)})`) : undefined,
                        }}
                      >
                        {count}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </div>
  );
}
