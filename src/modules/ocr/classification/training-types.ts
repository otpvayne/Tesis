export const DATASET_PARTITIONS = ["train", "validation", "test"] as const;
export type DatasetPartition = (typeof DATASET_PARTITIONS)[number];

export interface DatasetStats {
  total: number;
  byLabel: Record<string, number>;
  byPartition: Record<string, number>;
}

export interface LabeledSampleInput {
  /** Descriptor HOG (`extractHOG`, 108 valores) ya calculado en el navegador — `ImageData` no existe en el runtime de la Server Action. */
  descriptor: number[];
  label: string;
  sourceDocument: string;
  partition: DatasetPartition;
}

export interface SaveLabeledSamplesResult {
  saved: number;
}

export interface TrainAndEvaluateResult {
  trainCount: number;
  testCount: number;
  classes: number;
  /** `null` si no hay muestras de `test` — nunca se reporta un accuracy inventado sobre 0 casos. */
  accuracy: number | null;
  modelId: string;
}

export interface SaveSyntheticModelInput {
  /** `serializeModel(classifier)` — el entrenamiento (fuentes+distorsiones+HOG+kNN) corre en el navegador, ver `dataset-synthesizer.ts`. */
  modelJson: string;
  metrics: {
    accuracy: number | null;
    trainCount: number;
    testCount: number;
    classes: number;
    trainingTimeMs: number;
  };
}

export interface SaveSyntheticModelResult {
  modelId: string;
  version: string;
}
