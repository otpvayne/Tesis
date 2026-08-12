/**
 * Representación en memoria de una muestra etiquetada, usada durante el
 * etiquetado en OCR LAB y en los tests de esta fase. **No es el formato de
 * persistencia** — la tabla `ocr_training_samples` (Supabase) guarda
 * `feature_data` (el descriptor ya extraído, no el `ImageData` crudo) y
 * `dataset_partition` (`'train' | 'validation' | 'test'`, con `CHECK` a
 * nivel de tabla) en vez de `confidence`/`sourceDocument` sueltos — ver
 * `supabase/migrations/20260811200943_create_ocr_training_samples.sql`.
 * El mapeo entre esta forma y la fila de Supabase vive en la capa que
 * persiste (`ocr-lab/train`), no aquí.
 */
export interface TrainingSample {
  characterImageData: ImageData;
  label: string;
  sourceDocument: string;
  /** Qué tan clara/segura es la etiqueta para quien la asignó, `[0, 1]` (`1` = perfecta). No se persiste todavía — ver nota de arriba. */
  confidence: number;
}

/**
 * Colección de `TrainingSample` con conteo por label y partición
 * train/test. **No implementa el split train/validation/test de tres vías
 * que exige `CLAUDE.md` §7** (`test` nunca se usa para entrenar) — esa
 * disciplina la aplica la partición real en Supabase
 * (`ocr_training_samples.dataset_partition`, Fase 4d). Esta clase es una
 * utilidad de conveniencia para trabajar con datasets en memoria (tests de
 * esta fase, experimentación local en OCR LAB antes de persistir).
 */
export class Dataset {
  readonly samples: readonly TrainingSample[];
  readonly labelCounts: Readonly<Record<string, number>>;

  constructor(samples: TrainingSample[]) {
    this.samples = samples;
    const counts: Record<string, number> = {};
    for (const sample of samples) {
      counts[sample.label] = (counts[sample.label] ?? 0) + 1;
    }
    this.labelCounts = counts;
  }

  /**
   * Split **estratificado por label**: para cada label, las primeras
   * `round(trainRatio × count)` muestras van a `train` (en el orden en que
   * llegaron), el resto a `test`. Estratificado para que una label con
   * pocas muestras no quede ausente de uno de los dos conjuntos solo por
   * el orden de carga — con un split global (no por label), una label con
   * 3 muestras al final del arreglo podría caer entera en `test` aunque
   * `trainRatio=0.8`.
   *
   * Determinista a propósito: sin mezcla aleatoria, el resultado es
   * reproducible y verificable a mano en los tests. Si hace falta romper
   * el sesgo por orden de captura, se agrega aleatoriedad explícita (con
   * semilla) más adelante — no implícita aquí.
   */
  split(trainRatio: number): { train: Dataset; test: Dataset } {
    if (!(trainRatio > 0) || !(trainRatio < 1)) {
      throw new Error(`Dataset.split: trainRatio debe estar en (0, 1), recibido ${trainRatio}`);
    }

    const byLabel = new Map<string, TrainingSample[]>();
    for (const sample of this.samples) {
      const group = byLabel.get(sample.label);
      if (group) {
        group.push(sample);
      } else {
        byLabel.set(sample.label, [sample]);
      }
    }

    const trainSamples: TrainingSample[] = [];
    const testSamples: TrainingSample[] = [];
    for (const group of byLabel.values()) {
      const trainCount = Math.round(group.length * trainRatio);
      trainSamples.push(...group.slice(0, trainCount));
      testSamples.push(...group.slice(trainCount));
    }

    return { train: new Dataset(trainSamples), test: new Dataset(testSamples) };
  }
}
