import type { CharacterClassifier } from "@/modules/ocr/classification/character-classifier";

export interface CharacterTestSample {
  imageData: ImageData;
  expectedLabel: string;
}

export interface Misclassification {
  actual: string;
  predicted: string;
  count: number;
}

export interface CharacterMetrics {
  totalCharactersProcessed: number;
  correctCharacters: number;
  /** `0` si `testSet` está vacío — nunca se reporta un accuracy inventado sobre 0 casos. */
  accuracy: number;
  perClassAccuracy: Record<string, number>;
  /** Orden de filas/columnas de `confusionMatrix` — las labels vistas como `expected` en el set evaluado (no un 62×62 fijo: con un test set chico, la mayoría de esas filas/columnas estarían vacías sin aportar nada, igual que `model-trainer.ts` de Fase 4d). */
  labels: string[];
  /** `confusionMatrix[i][j]` = # de muestras con label real `labels[i]` predichas como `labels[j]`. */
  confusionMatrix: number[][];
  /** Las 10 confusiones más frecuentes, ordenadas descendente. */
  commonMisclassifications: Misclassification[];
}

interface LabeledPrediction {
  expected: string;
  predicted: string;
}

/**
 * El cálculo real (accuracy, matriz de confusión, misclassifications),
 * separado de `evaluateCharacterRecognition` para poder reusarlo con
 * predicciones ya hechas de cualquier fuente — en particular,
 * `ocr_training_samples.feature_data` guarda el **descriptor HOG ya
 * extraído**, no el `ImageData` crudo (Fase 4c/4d), así que evaluar
 * contra la partición `test` real necesita predecir con
 * `KNNClassifier.predict(descriptor)` directamente, no con
 * `CharacterClassifier.predict(imageData)` — no hay forma de reconstruir
 * la imagen desde su descriptor (transformación de un solo sentido).
 */
export function computeCharacterMetrics(predictions: LabeledPrediction[]): CharacterMetrics {
  const labels = Array.from(new Set(predictions.map((p) => p.expected))).sort();
  const labelIndex = new Map(labels.map((label, i) => [label, i]));
  const confusionMatrix = labels.map(() => new Array<number>(labels.length).fill(0));

  const perClassTotal: Record<string, number> = {};
  const perClassCorrect: Record<string, number> = {};
  const misclassCounts = new Map<string, number>();

  let correct = 0;
  for (const { expected, predicted } of predictions) {
    perClassTotal[expected] = (perClassTotal[expected] ?? 0) + 1;

    if (predicted === expected) {
      correct++;
      perClassCorrect[expected] = (perClassCorrect[expected] ?? 0) + 1;
    } else {
      const key = `${expected}→${predicted}`;
      misclassCounts.set(key, (misclassCounts.get(key) ?? 0) + 1);
    }

    const actualIdx = labelIndex.get(expected);
    const predictedIdx = labelIndex.get(predicted);
    if (actualIdx !== undefined && predictedIdx !== undefined) {
      confusionMatrix[actualIdx][predictedIdx]++;
    }
    // Si el modelo predice una label que nunca aparece como "expected" en
    // el set evaluado, no hay fila/columna para ella en la matriz -- sí
    // cuenta en accuracy/misclassifications, solo no en la matriz
    // (agrandarla por cada label "extra" que el modelo invente no aporta
    // valor: son labels que el set evaluado no está evaluando de todas
    // formas).
  }

  const perClassAccuracy: Record<string, number> = {};
  for (const label of labels) {
    perClassAccuracy[label] = perClassCorrect[label] ? perClassCorrect[label] / perClassTotal[label] : 0;
  }

  const commonMisclassifications: Misclassification[] = Array.from(misclassCounts.entries())
    .map(([key, count]) => {
      const [actual, predicted] = key.split("→");
      return { actual, predicted, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    totalCharactersProcessed: predictions.length,
    correctCharacters: correct,
    accuracy: predictions.length > 0 ? correct / predictions.length : 0,
    perClassAccuracy,
    labels,
    confusionMatrix,
    commonMisclassifications,
  };
}

/**
 * Evalúa un `CharacterClassifier` ya entrenado contra un conjunto de test
 * con verdad conocida (`expectedLabel`), partiendo de `ImageData` — el
 * caso de uso con datos sintéticos/tests de esta fase.
 */
export function evaluateCharacterRecognition(testSet: CharacterTestSample[], model: CharacterClassifier): CharacterMetrics {
  const predictions = testSet.map((sample) => ({
    expected: sample.expectedLabel,
    predicted: model.predict(sample.imageData).label,
  }));
  return computeCharacterMetrics(predictions);
}
