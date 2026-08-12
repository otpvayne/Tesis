"use client";

import { useState, useTransition } from "react";
import { synthesizeDataset } from "@/modules/ocr/classification/dataset-synthesizer";
import { trainModel, type TrainingResult } from "@/modules/ocr/classification/model-trainer";
import { serializeModel } from "@/modules/ocr/classification/model-persistence";
import { activateModel, saveSyntheticModel } from "@/modules/ocr/classification/training-actions";
import { OCR_TRAINING_CONFIG } from "@/modules/ocr/config";

const DEFAULT_CHARACTERS = [
  ...Array.from({ length: 10 }, (_, i) => String(i)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)),
];

/**
 * Sintetiza + entrena + evalúa **enteramente en el navegador**: renderizar
 * fuentes con Canvas 2D (`ctx.font`/`fillText`) requiere un navegador
 * real, no existe en el entorno donde se generó este código (ver nota en
 * `dataset-synthesizer.ts`). No hay forma de producir un dataset/modelo
 * real ni cifras de accuracy desde ahí — esto lo corre el equipo aquí.
 */
export function SyntheticTrainingPanel() {
  const [samplesPerCharacter, setSamplesPerCharacter] = useState(20);
  const [characters, setCharacters] = useState(DEFAULT_CHARACTERS.join(""));
  const [result, setResult] = useState<TrainingResult | null>(null);
  const [modelJson, setModelJson] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedModelId, setSavedModelId] = useState<string | null>(null);
  const [isWorking, startWorking] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isActivating, startActivating] = useTransition();

  function handleGenerateAndTrain() {
    setError(null);
    setStatus(null);
    setResult(null);
    setModelJson(null);
    setSavedModelId(null);

    startWorking(() => {
      try {
        const charList = Array.from(new Set(characters.split("").filter((c) => c.trim() !== "")));
        if (charList.length === 0) {
          throw new Error("Ingresa al menos un carácter.");
        }

        const dataset = synthesizeDataset({
          charactersToGenerate: charList,
          samplesPerCharacter,
          imageSize: 32,
          fonts: [...OCR_TRAINING_CONFIG.SYNTHETIC_FONTS],
          distortions: {
            rotationRange: OCR_TRAINING_CONFIG.DISTORTION_ROTATION_RANGE,
            scaleRange: OCR_TRAINING_CONFIG.DISTORTION_SCALE_RANGE,
            noiseLevel: OCR_TRAINING_CONFIG.DISTORTION_NOISE_LEVEL,
            skewRange: OCR_TRAINING_CONFIG.DISTORTION_SKEW_RANGE,
          },
        });

        const trained = trainModel(dataset, OCR_TRAINING_CONFIG.KNN_K, OCR_TRAINING_CONFIG.TRAIN_TEST_SPLIT);
        setResult(trained);
        setModelJson(serializeModel(trained.model));
        setStatus(`Dataset generado: ${dataset.samples.length} muestras (${charList.length} caracteres × ${samplesPerCharacter}).`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo generar/entrenar el dataset sintético.");
      }
    });
  }

  function handleSaveModel() {
    if (!result || !modelJson) return;
    setError(null);
    startSaving(async () => {
      try {
        const saved = await saveSyntheticModel({
          modelJson,
          metrics: {
            accuracy: result.metrics.accuracy,
            trainCount: result.metrics.trainCount,
            testCount: result.metrics.testCount,
            classes: result.metrics.labels.length,
            trainingTimeMs: result.trainingTime,
          },
        });
        setStatus(`Modelo guardado en ocr_models (id=${saved.modelId}, version=${saved.version}, inactivo).`);
        setSavedModelId(saved.modelId);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar el modelo.");
      }
    });
  }

  function handleActivate() {
    if (!savedModelId) return;
    setError(null);
    startActivating(async () => {
      try {
        await activateModel(savedModelId);
        setStatus("Modelo activado — /documents/[id] ya puede usarlo para procesar facturas.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo activar el modelo.");
      }
    });
  }

  function handleDownloadModel() {
    if (!modelJson) return;
    const blob = new Blob([modelJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "model-knn-synthetic.json";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
      <div>
        <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Dataset sintético (fuentes + distorsiones) — Fase 4d
        </p>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Genera caracteres con fuentes del sistema (Canvas 2D), aplica rotación/escala/skew/ruido, extrae HOG y
          entrena un kNN — todo en este navegador. Sirve como modelo base (&ldquo;pretrain&rdquo;) mientras el equipo etiqueta
          facturas reales en la sección de arriba (fine-tuning, Fase 4e+).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-sm">
        <label className="flex flex-col gap-1 text-neutral-600 dark:text-neutral-400">
          Caracteres
          <input
            type="text"
            value={characters}
            onChange={(e) => setCharacters(e.target.value)}
            className="w-64 rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <label className="flex flex-col gap-1 text-neutral-600 dark:text-neutral-400">
          Muestras/carácter
          <input
            type="number"
            min={1}
            value={samplesPerCharacter}
            onChange={(e) => setSamplesPerCharacter(Math.max(1, Number(e.target.value) || 1))}
            className="w-24 rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
          />
        </label>
        <p className="text-xs text-neutral-500 dark:text-neutral-500">
          Total: {Array.from(new Set(characters.split(""))).filter((c) => c.trim()).length * samplesPerCharacter}{" "}
          muestras (recomendado en `OCR_TRAINING_CONFIG`: {OCR_TRAINING_CONFIG.SYNTHETIC_SAMPLES_PER_CHARACTER}
          /carácter — valores altos pueden tardar/trabar la pestaña, corre en el hilo principal, no en Web Worker).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleGenerateAndTrain}
          disabled={isWorking}
          className="rounded-md border border-sky-500 px-3 py-2 text-sm font-medium text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-400 dark:text-sky-300"
        >
          {isWorking ? "Generando y entrenando..." : "Generar dataset y entrenar"}
        </button>
        <button
          type="button"
          onClick={handleSaveModel}
          disabled={!result || isSaving}
          className="rounded-md border border-neutral-300 px-3 py-2 text-sm font-medium text-neutral-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:text-neutral-200"
        >
          {isSaving ? "Guardando..." : "Guardar modelo (ocr_models)"}
        </button>
        <button
          type="button"
          onClick={handleDownloadModel}
          disabled={!modelJson}
          className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-900"
        >
          Descargar modelo (JSON)
        </button>
        <button
          type="button"
          onClick={handleActivate}
          disabled={!savedModelId || isActivating}
          className="rounded-md border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-400 dark:text-emerald-300"
        >
          {isActivating ? "Activando..." : "Activar este modelo"}
        </button>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {status ? <p className="text-sm text-green-700 dark:text-green-400">{status}</p> : null}

      {result ? (
        <div className="flex flex-col gap-2 text-sm text-neutral-700 dark:text-neutral-300">
          <p>
            Accuracy:{" "}
            {result.metrics.accuracy === null ? "sin muestras de test" : `${(result.metrics.accuracy * 100).toFixed(1)}%`} —
            tiempo de entrenamiento: {result.trainingTime.toFixed(1)}ms — {result.metrics.labels.length} clases
          </p>
          {result.generalizationWarning ? (
            <p role="alert" className="text-amber-700 dark:text-amber-400">
              ⚠ {result.generalizationWarning}
            </p>
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
                        style={{ backgroundColor: count > 0 ? (i === j ? `rgba(34,197,94,${Math.min(1, count / 5)})` : `rgba(239,68,68,${Math.min(1, count / 5)})`) : undefined }}
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
