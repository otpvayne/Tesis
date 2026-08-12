"use client";

import { useState, useTransition } from "react";
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
  getDatasetStats,
  saveLabeledSamples,
  trainAndEvaluateModel,
} from "@/modules/ocr/classification/training-actions";
import { DATASET_PARTITIONS, type DatasetPartition, type DatasetStats, type TrainAndEvaluateResult } from "@/modules/ocr/classification/training-types";
import { CharacterThumbnail } from "@/app/(dashboard)/ocr-lab/_components/canvas-utils";
import { SyntheticTrainingPanel } from "./synthetic-training-panel";

/** `0-9`, `A-Z`, `a-z` — mismo alfabeto que valida `training-actions.ts` (`CLAUDE.md` §7). */
const LABEL_OPTIONS = [
  ...Array.from({ length: 10 }, (_, i) => String(i)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)),
  ...Array.from({ length: 26 }, (_, i) => String.fromCharCode(97 + i)),
];

interface LabeledCharacter {
  id: string;
  imageData: ImageData;
  descriptor: Float32Array;
  label: string;
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

export function OcrTrainClient({ initialStats }: { initialStats: DatasetStats }) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sourceDocument, setSourceDocument] = useState<string>("");
  const [characters, setCharacters] = useState<LabeledCharacter[]>([]);
  const [partition, setPartition] = useState<DatasetPartition>("train");
  const [stats, setStats] = useState<DatasetStats>(initialStats);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [trainResult, setTrainResult] = useState<TrainAndEvaluateResult | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isTraining, startTraining] = useTransition();

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
      setCharacters(
        normalizedCharacters.map((imageData, i) => ({
          id: `${file.name}-${i}`,
          imageData,
          descriptor: extractHOG(imageData),
          label: "",
        })),
      );
      setSourceDocument(file.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo procesar la imagen.");
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  }

  function setLabel(id: string, label: string) {
    setCharacters((prev) => prev.map((c) => (c.id === id ? { ...c, label } : c)));
  }

  const labeledCount = characters.filter((c) => c.label !== "").length;

  function handleSave() {
    const toSave = characters.filter((c) => c.label !== "");
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
        // Quita del grid las que ya se guardaron -- evita guardarlas dos veces por error.
        setCharacters((prev) => prev.filter((c) => c.label === ""));
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudieron guardar las etiquetas.");
      }
    });
  }

  function handleTrain() {
    setError(null);
    setTrainResult(null);
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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border border-neutral-200 p-3 text-xs text-neutral-600 dark:border-neutral-800 dark:text-neutral-400">
        <p className="font-medium text-neutral-500 dark:text-neutral-500">Dataset actual (invoice_es)</p>
        <p>
          {stats.total} muestras totales — por partición:{" "}
          {DATASET_PARTITIONS.map((p) => `${p}=${stats.byPartition[p] ?? 0}`).join(", ")} — {Object.keys(stats.byLabel).length} labels distintas
        </p>
      </div>

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
              Etiquetadas: {labeledCount}/{characters.length} caracteres de esta imagen
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

          <div className="grid grid-cols-1 gap-3 rounded-md border border-neutral-200 p-3 sm:grid-cols-2 md:grid-cols-3 dark:border-neutral-800">
            {characters.map((character) => (
              <div key={character.id} className="flex items-center gap-2">
                <CharacterThumbnail imageData={character.imageData} />
                <select
                  value={character.label}
                  onChange={(e) => setLabel(character.id, e.target.value)}
                  className="rounded-md border border-neutral-300 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-950"
                >
                  <option value="">sin etiquetar</option>
                  {LABEL_OPTIONS.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
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
          <p className="text-sm text-neutral-700 dark:text-neutral-300">
            Entrenado con {trainResult.trainCount} muestras ({trainResult.classes} labels distintas). Accuracy en{" "}
            {trainResult.testCount} muestras de test:{" "}
            {trainResult.accuracy === null
              ? "sin muestras de test todavía, no medible"
              : `${(trainResult.accuracy * 100).toFixed(1)}%`}
            . Modelo guardado (`ocr_models`, inactivo — activarlo es una decisión aparte).
          </p>
        ) : null}
      </div>

      <SyntheticTrainingPanel />
    </div>
  );
}
