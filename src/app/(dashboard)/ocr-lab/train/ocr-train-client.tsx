"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { decodeImage } from "@/modules/ocr/preprocessing/decode-image";
import { toGrayscale } from "@/modules/ocr/preprocessing/grayscale";
import { normalizeRange } from "@/modules/ocr/preprocessing/normalize";
import { gaussianBlur } from "@/modules/ocr/preprocessing/gaussian-blur";
import { otsuBinarization } from "@/modules/ocr/preprocessing/otsu-binarization";
import { ensureTextIsForeground } from "@/modules/ocr/segmentation/normalize-polarity";
import { findConnectedComponents } from "@/modules/ocr/segmentation/connected-components";
import { extractLines } from "@/modules/ocr/segmentation/extract-lines";
import { extractWordsFromLine } from "@/modules/ocr/segmentation/extract-words";
import { extractCharactersFromWord } from "@/modules/ocr/segmentation/extract-characters";
import { normalizeCharacter } from "@/modules/ocr/segmentation/normalize-character";
import { extractHOG } from "@/modules/ocr/classification/hog-extractor";
import {
  activateModel,
  getDatasetStats,
  saveLabeledSamples,
  trainAndEvaluateModel,
} from "@/modules/ocr/classification/training-actions";
import { DATASET_PARTITIONS, type DatasetPartition, type DatasetStats, type TrainAndEvaluateResult } from "@/modules/ocr/classification/training-types";
import { OCR_ALPHABET, computeClassProgress, countPendingByLabel, findNextPendingIndex } from "@/modules/ocr/training/label-progress";
import { CharacterThumbnail } from "@/app/(dashboard)/ocr-lab/_components/canvas-utils";
import { ClassProgressGrid } from "./class-progress-grid";
import { SyntheticTrainingPanel } from "./synthetic-training-panel";
import { EvaluationPanel } from "./evaluation-panel";

interface LabeledCharacter {
  id: string;
  imageData: ImageData;
  descriptor: Float32Array;
  label: string;
  /**
   * Marca un carácter mal segmentado (fusionado con otro, partido en dos,
   * ruido que pasó el filtro de tamaño) para excluirlo permanentemente del
   * guardado, sin borrarlo de la grilla — antes no había forma de
   * descartarlo: quedaba "sin etiquetar" para siempre, mezclado a simple
   * vista con los caracteres que sí faltan por etiquetar. Reversible
   * (botón "restaurar") por si se descarta por error.
   */
  discarded: boolean;
}

function segmentCharacters(raw: ImageData): ImageData[] {
  const gray = toGrayscale(raw);
  const normalized = normalizeRange(gray);
  const blurred = gaussianBlur(normalized, 1);
  const binary = otsuBinarization(blurred);
  const foreground = ensureTextIsForeground(binary);

  const components = findConnectedComponents(foreground);
  const lines = extractLines(foreground, components);
  const words = lines.flatMap((line) => extractWordsFromLine(line));
  const characters = words.flatMap((word) => extractCharactersFromWord(word));
  return characters.map((character) => normalizeCharacter(character));
}

/** Único carácter válido por tecla — mismo alfabeto que `VALID_LABEL_PATTERN` en `training-actions.ts`. */
function keyToLabel(key: string): string | null {
  return /^[0-9A-Za-z]$/.test(key) ? key : null;
}

export function OcrTrainClient({ initialStats }: { initialStats: DatasetStats }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceDocument, setSourceDocument] = useState<string>("");
  const [characters, setCharacters] = useState<LabeledCharacter[]>([]);
  const [cursorIndex, setCursorIndex] = useState<number>(-1);
  const [partition, setPartition] = useState<DatasetPartition>("train");
  const [stats, setStats] = useState<DatasetStats>(initialStats);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [trainResult, setTrainResult] = useState<TrainAndEvaluateResult | null>(null);
  const [activateMessage, setActivateMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isTraining, startTraining] = useTransition();
  const [isActivating, startActivating] = useTransition();

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setSaveMessage(null);
    setTrainResult(null);
    setLoading(true);
    try {
      const raw = await decodeImage(file);
      const normalizedCharacters = segmentCharacters(raw);
      const nextCharacters: LabeledCharacter[] = normalizedCharacters.map((imageData, i) => ({
        id: `${file.name}-${i}`,
        imageData,
        descriptor: extractHOG(imageData),
        label: "",
        discarded: false,
      }));
      setCharacters(nextCharacters);
      setCursorIndex(nextCharacters.length > 0 ? 0 : -1);
      setSourceDocument(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la imagen.");
      setCharacters([]);
      setCursorIndex(-1);
    } finally {
      setLoading(false);
    }
  }

  /**
   * Único punto donde se asigna una etiqueta (desde el teclado o desde el
   * `<select>` de un carácter) — siempre mueve el cursor al siguiente
   * carácter pendiente (`findNextPendingIndex`), para que ambos caminos
   * (mouse y teclado) mantengan el mismo auto-avance.
   */
  // Ambas funciones se llaman siempre de forma síncrona (desde el handler
  // de teclado o un evento onClick/onChange, nunca después de un await),
  // así que leer `characters` del closure directo es seguro -- no hace
  // falta la forma funcional `setCharacters(prev => ...)` aquí, y evita
  // llamar `setCursorIndex` desde dentro del updater de `setCharacters`
  // (React puede invocar ese updater más de una vez en Strict Mode).
  function assignLabel(index: number, label: string) {
    const next = characters.map((c, i) => (i === index ? { ...c, label, discarded: false } : c));
    setCharacters(next);
    setCursorIndex(findNextPendingIndex(next, index) ?? index);
  }

  function toggleDiscard(index: number, discarded: boolean) {
    const next = characters.map((c, i) => (i === index ? { ...c, label: discarded ? "" : c.label, discarded } : c));
    setCharacters(next);
    if (discarded) setCursorIndex(findNextPendingIndex(next, index) ?? index);
  }

  // Atajos de teclado del flujo de etiquetado: escribir 0-9/A-Z/a-z
  // etiqueta el carácter enfocado (`cursorIndex`) y avanza solo al
  // siguiente pendiente; Backspace/Delete lo descarta (mala segmentación);
  // flechas mueven el foco sin etiquetar. Es la mejora de mayor impacto
  // para la meta del handoff (100+ muestras × 62 clases ≈ 6200
  // etiquetas): antes cada una requería abrir un <select> de 63 opciones
  // con el mouse.
  //
  // Se ignora el atajo si el foco del documento está en un elemento de
  // formulario real (el <input type="file">, un <select> de corrección
  // manual, etc.) para no interferir con su comportamiento nativo — solo
  // actúa cuando el admin está "parado" en la grilla, no escribiendo en
  // otro control.
  useEffect(() => {
    if (characters.length === 0) return;

    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const isFormElement = target instanceof HTMLElement && ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName);
      if (isFormElement || cursorIndex < 0) return;

      const label = keyToLabel(event.key);
      if (label) {
        event.preventDefault();
        assignLabel(cursorIndex, label);
        return;
      }

      if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault();
        toggleDiscard(cursorIndex, true);
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        setCursorIndex((i) => Math.min(characters.length - 1, i + 1));
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setCursorIndex((i) => Math.max(0, i - 1));
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [characters, cursorIndex]);

  const activeCharacters = characters.filter((c) => !c.discarded);
  const labeledCount = activeCharacters.filter((c) => c.label !== "").length;
  const focusedCharacter = cursorIndex >= 0 ? characters[cursorIndex] : undefined;

  const classProgress = useMemo(
    () => computeClassProgress(OCR_ALPHABET, stats.byLabel, countPendingByLabel(characters)),
    [stats.byLabel, characters],
  );

  function handleSave() {
    const toSave = characters.filter((c) => !c.discarded && c.label !== "");
    if (toSave.length === 0) return;

    setError(null);
    setSaveMessage(null);
    startSaving(async () => {
      try {
        const result = await saveLabeledSamples(
          toSave.map((c) => ({
            descriptor: Array.from(c.descriptor),
            label: c.label,
            sourceDocument,
            partition,
          })),
        );
        setSaveMessage(`Guardadas ${result.saved} muestras en la partición "${partition}".`);
        setStats(await getDatasetStats());
        // Quita del grid las que ya se guardaron (mantiene las
        // descartadas y las que quedaron sin etiquetar) -- evita
        // guardarlas dos veces por error. Forma funcional (`prev => ...`)
        // a propósito: es la única actualización de este archivo que
        // ocurre después de un `await`, así que si el admin etiquetó más
        // caracteres mientras la petición estaba en vuelo, `prev` sigue
        // siendo el estado real más reciente, no el de cuando arrancó el
        // guardado. El cursor se recalcula aparte (no dentro del updater)
        // sobre esa misma foto de "antes de guardar" -- suficiente para
        // el caso común (nadie tipea durante el round-trip de guardado);
        // si sí tipeó, el siguiente atajo de teclado lo corrige solo.
        const remainingBeforeSave = characters.filter((c) => c.discarded || c.label === "");
        setCharacters((prev) => prev.filter((c) => c.discarded || c.label === ""));
        setCursorIndex(remainingBeforeSave.length > 0 ? (findNextPendingIndex(remainingBeforeSave, -1) ?? 0) : -1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron guardar las etiquetas.");
      }
    });
  }

  function handleTrain() {
    setError(null);
    setTrainResult(null);
    setActivateMessage(null);
    startTraining(async () => {
      try {
        const result = await trainAndEvaluateModel();
        setTrainResult(result);
        setStats(await getDatasetStats());
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo entrenar el modelo.");
      }
    });
  }

  function handleActivate() {
    if (!trainResult) return;
    setError(null);
    startActivating(async () => {
      try {
        await activateModel(trainResult.modelId);
        setActivateMessage("Modelo activado — /documents/[id] ya puede usarlo para procesar facturas.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo activar el modelo.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-neutral-200 p-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <p className="font-medium text-neutral-500 dark:text-neutral-500">Dataset actual (invoice_es)</p>
        <p>
          {stats.total} muestras totales — por partición:{" "}
          {DATASET_PARTITIONS.map((p) => `${p}=${stats.byPartition[p] ?? 0}`).join(", ")} — {Object.keys(stats.byLabel).length} labels distintas
        </p>
      </div>

      <ClassProgressGrid progress={classProgress} />

      <label className="flex flex-col gap-1 text-sm font-medium text-neutral-700 dark:text-neutral-300">
        Imagen de factura (JPG o PNG)
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChange}
          className="rounded-md border border-neutral-300 px-4 py-3 text-base text-neutral-900 outline-none dark:border-neutral-700 dark:bg-neutral-950 dark:text-neutral-50"
        />
      </label>

      {loading ? <p className="text-sm text-neutral-600 dark:text-neutral-400">Segmentando caracteres...</p> : null}
      {error ? (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}
      {saveMessage ? <p className="text-sm text-green-700 dark:text-green-400">{saveMessage}</p> : null}

      {characters.length > 0 ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Etiquetadas: {labeledCount}/{activeCharacters.length} caracteres de esta imagen
            </p>
            <label className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-400">
              Partición al guardar
              <select
                value={partition}
                onChange={(e) => setPartition(e.target.value as DatasetPartition)}
                className="rounded-md border border-neutral-300 px-2 py-1 dark:border-neutral-700 dark:bg-neutral-950"
              >
                {DATASET_PARTITIONS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || labeledCount === 0}
              className="rounded-md border border-sky-500 px-3 py-2 text-sm font-medium text-sky-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-400 dark:text-sky-300"
            >
              {isSaving ? "Guardando..." : `Guardar etiquetas (${labeledCount})`}
            </button>
          </div>

          {focusedCharacter ? (
            <div className="flex items-center gap-4 rounded-md border border-sky-300 bg-sky-50 p-3 dark:border-sky-800 dark:bg-sky-950">
              <CharacterThumbnail
                imageData={focusedCharacter.imageData}
                className="h-24 w-24 rounded border border-sky-400 bg-black dark:border-sky-600"
              />
              <div className="flex flex-col gap-1 text-sm text-sky-900 dark:text-sky-200">
                <p className="font-medium">
                  Carácter {cursorIndex + 1}/{characters.length} — escribe la letra/número correcto
                </p>
                <p className="text-xs text-sky-700 dark:text-sky-400">
                  Atajos: teclea 0-9/A-Z/a-z para etiquetar y avanzar · ← → mueve el foco · Supr/Backspace descarta (mala segmentación)
                </p>
              </div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-2 md:grid-cols-3 dark:border-neutral-800">
            {characters.map((character, index) => (
              <div
                key={character.id}
                className={`flex items-center gap-2 rounded-md p-1 ${
                  index === cursorIndex ? "ring-2 ring-sky-500 dark:ring-sky-400" : ""
                } ${character.discarded ? "opacity-40" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setCursorIndex(index)}
                  aria-label={`Enfocar carácter ${index + 1}`}
                  className="shrink-0"
                >
                  <CharacterThumbnail imageData={character.imageData} />
                </button>
                {character.discarded ? (
                  <button
                    type="button"
                    onClick={() => toggleDiscard(index, false)}
                    className="text-xs text-neutral-500 underline dark:text-neutral-400"
                  >
                    descartado — restaurar
                  </button>
                ) : (
                  <select
                    value={character.label}
                    onChange={(e) => assignLabel(index, e.target.value)}
                    className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                  >
                    <option value="">sin etiquetar</option>
                    {OCR_ALPHABET.map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}

      <div className="flex flex-col gap-2 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleTrain}
            disabled={isTraining}
            className="rounded-md bg-neutral-900 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40 dark:bg-neutral-50 dark:text-neutral-900"
          >
            {isTraining ? "Entrenando..." : "Entrenar modelo (kNN sobre 'train', evalúa contra 'test')"}
          </button>
        </div>
        {trainResult ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              Entrenado con {trainResult.trainCount} muestras ({trainResult.classes} labels distintas). Accuracy en{" "}
              {trainResult.testCount} muestras de test:{" "}
              {trainResult.accuracy === null
                ? "sin muestras de test todavía, no medible"
                : `${(trainResult.accuracy * 100).toFixed(1)}%`}
              . Modelo guardado (`ocr_models`, inactivo por defecto).
            </p>
            <button
              type="button"
              onClick={handleActivate}
              disabled={isActivating}
              className="self-start rounded-md border border-emerald-500 px-3 py-2 text-sm font-medium text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:border-emerald-400 dark:text-emerald-300"
            >
              {isActivating ? "Activando..." : "Activar este modelo"}
            </button>
            {activateMessage ? <p className="text-sm text-green-700 dark:text-green-400">{activateMessage}</p> : null}
          </div>
        ) : null}
      </div>

      <SyntheticTrainingPanel />
      <EvaluationPanel />
    </div>
  );
}
