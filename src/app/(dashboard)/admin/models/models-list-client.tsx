"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { activateModel, deactivateModel } from "@/modules/ocr/classification/training-actions";
import type { OcrModelSummary } from "@/modules/ocr/classification/training-types";

function formatAccuracy(accuracy: number | null | undefined): string {
  return accuracy === null || accuracy === undefined ? "sin medir" : `${(accuracy * 100).toFixed(1)}%`;
}

export function ModelsListClient({ models }: { models: OcrModelSummary[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleActivate(modelId: string) {
    setError(null);
    setBusyId(modelId);
    startTransition(async () => {
      try {
        await activateModel(modelId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo activar el modelo.");
      } finally {
        setBusyId(null);
      }
    });
  }

  function handleDeactivate(modelId: string) {
    setError(null);
    setBusyId(modelId);
    startTransition(async () => {
      try {
        await deactivateModel(modelId);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo desactivar el modelo.");
      } finally {
        setBusyId(null);
      }
    });
  }

  if (models.length === 0) {
    return <p className="text-sm text-neutral-600 dark:text-neutral-400">Todavía no hay ningún modelo entrenado -- ver &quot;Entrenar modelo&quot; abajo.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {models.map((model) => (
        <div
          key={model.id}
          className={`flex flex-col gap-2 rounded-md border p-3 ${model.active ? "border-emerald-400 dark:border-emerald-700" : "border-neutral-200 dark:border-neutral-800"}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {model.documentType} — {model.version}
              {model.active ? <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-xs text-emerald-800 dark:bg-emerald-950 dark:text-emerald-400">ACTIVO</span> : null}
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400 sm:grid-cols-4">
            <dt>Creado</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">{new Date(model.createdAt).toLocaleString("es-CO")}</dd>
            <dt>Accuracy</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">{formatAccuracy(model.metrics.accuracy)}</dd>
            <dt>Train / Test</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">
              {model.metrics.trainCount ?? "—"} / {model.metrics.testCount ?? "—"}
            </dd>
            <dt>Clases</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">{model.metrics.classes ?? "—"}</dd>
          </dl>

          <div>
            {model.active ? (
              <button
                type="button"
                onClick={() => handleDeactivate(model.id)}
                disabled={isPending && busyId === model.id}
                className="rounded-md border border-red-400 px-3 py-1.5 text-xs font-medium text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-800 dark:text-red-400"
              >
                {isPending && busyId === model.id ? "Desactivando..." : "Desactivar"}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleActivate(model.id)}
                disabled={isPending && busyId === model.id}
                className="rounded-md border border-emerald-500 px-3 py-1.5 text-xs font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-400 dark:text-emerald-300"
              >
                {isPending && busyId === model.id ? "Activando..." : "Activar"}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
