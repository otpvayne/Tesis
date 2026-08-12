import { OCR_CONFIG } from "@/modules/ocr/config";

/**
 * Distancia euclidiana entre dos vectores de características del mismo
 * largo (descriptores HOG en este proyecto, pero la función es genérica).
 *
 * ```
 * d(a, b) = √( Σ_i (a_i - b_i)² )
 * ```
 */
export function euclideanDistance(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error(`euclideanDistance: los vectores deben tener el mismo largo (${a.length} vs ${b.length})`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

interface TrainedSample {
  descriptor: Float32Array;
  label: string;
}

export interface KNNPrediction {
  label: string;
  confidence: number;
  /** Distancias a los `k` vecinos usados, ordenadas ascendente. */
  distances: number[];
  /**
   * Todas las labels distintas entre los `k` vecinos, con su proporción del
   * peso total (`confidence` de cada una) — ordenadas descendente.
   * `topN[0]` es siempre `{ label, confidence }` de la predicción ganadora.
   */
  topN: Array<{ label: string; confidence: number }>;
}

/**
 * k-Nearest Neighbors propio (`CLAUDE.md` §7). No hay "entrenamiento" en
 * el sentido de ajustar parámetros — `train` solo memoriza las muestras
 * (kNN es un clasificador "lazy": todo el trabajo pasa en `predict`).
 *
 * **Votación ponderada por distancia** (no voto simple por mayoría): cada
 * uno de los `k` vecinos más cercanos aporta un peso
 * `1 / (distancia + KNN_EPSILON)` a su label — un vecino mucho más cercano
 * puede superar a dos vecinos lejanos de otra clase, a diferencia de un
 * conteo simple de votos. `KNN_EPSILON` evita división por cero cuando la
 * distancia es exactamente 0 (la muestra de test coincide con una de
 * entrenamiento). La `confidence` es la proporción del peso total que se
 * llevó la clase ganadora — `1` si todos los vecinos coinciden,
 * `→ 1/(clases distintas entre los vecinos)` en el caso más disperso.
 */
export class KNNClassifier {
  private samples: TrainedSample[] = [];

  train(descriptors: Float32Array[], labels: string[]): void {
    if (descriptors.length !== labels.length) {
      throw new Error(`KNNClassifier.train: descriptors (${descriptors.length}) y labels (${labels.length}) deben tener el mismo largo`);
    }
    this.samples = descriptors.map((descriptor, i) => ({ descriptor, label: labels[i] }));
  }

  predict(descriptor: Float32Array, k: number = OCR_CONFIG.KNN_K): KNNPrediction {
    if (this.samples.length === 0) {
      throw new Error("KNNClassifier.predict: no hay muestras de entrenamiento — llamar a train() primero");
    }

    const ranked = this.samples
      .map((sample) => ({ label: sample.label, distance: euclideanDistance(descriptor, sample.descriptor) }))
      .sort((a, b) => a.distance - b.distance);

    const neighbors = ranked.slice(0, Math.min(k, ranked.length));

    const weightByLabel = new Map<string, number>();
    let totalWeight = 0;
    for (const neighbor of neighbors) {
      const weight = 1 / (neighbor.distance + OCR_CONFIG.KNN_EPSILON);
      weightByLabel.set(neighbor.label, (weightByLabel.get(neighbor.label) ?? 0) + weight);
      totalWeight += weight;
    }

    const topN = Array.from(weightByLabel, ([label, weight]) => ({ label, confidence: weight / totalWeight })).sort(
      (a, b) => b.confidence - a.confidence,
    );

    return {
      label: topN[0].label,
      confidence: topN[0].confidence,
      distances: neighbors.map((neighbor) => neighbor.distance),
      topN,
    };
  }
}
