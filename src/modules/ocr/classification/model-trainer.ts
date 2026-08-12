import { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";
import type { Dataset } from "@/modules/ocr/classification/dataset";
import { OCR_TRAINING_CONFIG } from "@/modules/ocr/config";

export interface TrainingMetrics {
  /** `null` si la partición de test quedó vacía — nunca se reporta un accuracy inventado sobre 0 casos. */
  accuracy: number | null;
  /** Por label: `TP / (TP + FP)` — de lo que el modelo predijo como esta label, cuánto era correcto. */
  precision: Record<string, number>;
  /** Por label: `TP / (TP + FN)` — de lo que realmente era esta label, cuánto se predijo correcto. */
  recall: Record<string, number>;
  /** `confusionMatrix[i][j]` = # de muestras con label real `labels[i]` predichas como `labels[j]`. */
  confusionMatrix: number[][];
  /** Orden de filas/columnas de `confusionMatrix` — las labels vistas en `train`. */
  labels: string[];
  trainCount: number;
  testCount: number;
}

export interface TrainingResult {
  model: CharacterClassifier;
  metrics: TrainingMetrics;
  trainingTime: number;
  /** Presente si `accuracy < OCR_TRAINING_CONFIG.MIN_ACCURACY_THRESHOLD` — señal sobre el dataset/parámetros, no un veredicto sobre el modelo final (eso se mide con `test` real, Fase 4f). */
  generalizationWarning?: string;
}

/**
 * Entrena un `CharacterClassifier` (HOG + kNN) sobre `dataset` y evalúa en
 * un conjunto de test separado.
 *
 * **Split estratificado por label** (`Dataset.split`, Fase 4c) — no el
 * slice ingenuo `samples.slice(0, trainSize)` sobre el arreglo completo:
 * si el dataset se generó agrupado por carácter (`synthesizeDataset`
 * itera "para cada carácter, para cada muestra"), un slice global dejaría
 * las últimas labels casi enteras en `test` y las primeras casi enteras
 * en `train` — rompería la evaluación, no es un detalle menor. El split
 * estratificado divide cada label por separado, así que toda label
 * aparece en ambos conjuntos en la proporción `trainTestSplit`.
 */
export function trainModel(
  dataset: Dataset,
  k: number = OCR_TRAINING_CONFIG.KNN_K,
  trainTestSplit: number = OCR_TRAINING_CONFIG.TRAIN_TEST_SPLIT,
): TrainingResult {
  const { train, test } = dataset.split(trainTestSplit);

  if (train.samples.length === 0) {
    throw new Error("trainModel: la partición de entrenamiento quedó vacía — revisa el dataset o trainTestSplit.");
  }

  const model = new CharacterClassifier();
  const startTime = performance.now();
  model.train(train.samples.map((sample) => ({ imageData: sample.characterImageData, label: sample.label })));
  const trainingTime = performance.now() - startTime;

  const labels = Array.from(new Set(train.samples.map((sample) => sample.label))).sort();
  const labelIndex = new Map(labels.map((label, i) => [label, i]));
  const confusionMatrix = labels.map(() => new Array<number>(labels.length).fill(0));

  let correct = 0;
  for (const sample of test.samples) {
    const prediction = model.predict(sample.characterImageData, k);
    if (prediction.label === sample.label) correct++;

    const trueIdx = labelIndex.get(sample.label);
    // kNN solo predice labels vistas en train -- si `sample.label` (test)
    // no está en train, no hay fila para ella en la matriz (no se puede
    // acertar de todas formas, ver nota de accuracy más abajo).
    const predIdx = labelIndex.get(prediction.label);
    if (trueIdx !== undefined && predIdx !== undefined) {
      confusionMatrix[trueIdx][predIdx]++;
    }
  }

  const accuracy = test.samples.length > 0 ? correct / test.samples.length : null;

  const precision: Record<string, number> = {};
  const recall: Record<string, number> = {};
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    const truePositives = confusionMatrix[i][i];

    let predictedAsThisLabel = 0;
    for (let row = 0; row < labels.length; row++) predictedAsThisLabel += confusionMatrix[row][i];

    let actuallyThisLabel = 0;
    for (let col = 0; col < labels.length; col++) actuallyThisLabel += confusionMatrix[i][col];

    precision[label] = predictedAsThisLabel > 0 ? truePositives / predictedAsThisLabel : 0;
    recall[label] = actuallyThisLabel > 0 ? truePositives / actuallyThisLabel : 0;
  }

  const generalizationWarning =
    accuracy !== null && accuracy < OCR_TRAINING_CONFIG.MIN_ACCURACY_THRESHOLD
      ? `Accuracy ${(accuracy * 100).toFixed(1)}% por debajo del umbral ${(OCR_TRAINING_CONFIG.MIN_ACCURACY_THRESHOLD * 100).toFixed(0)}% — revisar parámetros de síntesis/distorsión, el dataset puede no ser aprendible con esta configuración.`
      : undefined;

  return {
    model,
    metrics: { accuracy, precision, recall, confusionMatrix, labels, trainCount: train.samples.length, testCount: test.samples.length },
    trainingTime,
    generalizationWarning,
  };
}
