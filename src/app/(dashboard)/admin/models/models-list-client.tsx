"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { activateModel, deactivateModel } from "@/modules/ocr/classification/training-actions";
import type { OcrModelSummary } from "@/modules/ocr/classification/training-types";
import { Button } from "@/components/common/Button";

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
        <p role="alert" className="text-sm text-critical-600 dark:text-critical-400">
          {error}
        </p>
      ) : null}

      {models.map((model) => (
        <div
          key={model.id}
          className={`flex flex-col gap-2 rounded-lg border p-3 transition-colors ${model.active ? "border-brand-400 dark:border-brand-700" : "border-neutral-200 dark:border-neutral-800"}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">
              {model.documentType} — {model.version}
              {model.active ? <span className="ml-2 rounded-full bg-brand-100 px-2 py-0.5 text-xs text-brand-800 dark:bg-brand-950 dark:text-brand-400">ACTIVO</span> : null}
            </p>
          </div>

          <dl className="font-data grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-neutral-600 dark:text-neutral-400 sm:grid-cols-4">
            <dt className="font-sans">Creado</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">{new Date(model.createdAt).toLocaleString("es-CO")}</dd>
            <dt className="font-sans">Accuracy</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">{formatAccuracy(model.metrics.accuracy)}</dd>
            <dt className="font-sans">Train / Test</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">
              {model.metrics.trainCount ?? "—"} / {model.metrics.testCount ?? "—"}
            </dd>
            <dt className="font-sans">Clases</dt>
            <dd className="text-neutral-900 dark:text-neutral-50">{model.metrics.classes ?? "—"}</dd>
          </dl>

          <div>
            {model.active ? (
              <Button variant="danger" size="sm" onClick={() => handleDeactivate(model.id)} disabled={isPending && busyId === model.id}>
                {isPending && busyId === model.id ? "Desactivando..." : "Desactivar"}
              </Button>
            ) : (
              <Button variant="primary" size="sm" onClick={() => handleActivate(model.id)} disabled={isPending && busyId === model.id}>
                {isPending && busyId === model.id ? "Activando..." : "Activar"}
              </Button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
