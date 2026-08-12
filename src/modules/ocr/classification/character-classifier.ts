import { extractHOG } from "@/modules/ocr/classification/hog-extractor";
import { KNNClassifier } from "@/modules/ocr/classification/knn-classifier";

export interface LabeledCharacter {
  imageData: ImageData;
  label: string;
}

export interface CharacterPrediction {
  label: string;
  confidence: number;
  topN: Array<{ label: string; confidence: number }>;
}

/**
 * Combina extracción de características (`extractHOG`) con clasificación
 * (`KNNClassifier`) en una sola interfaz por carácter — el resto del
 * pipeline (Fase 4b) trabaja con `ImageData`, no con vectores de
 * características, así que este es el punto donde se hace la conversión.
 * No agrega lógica propia más allá de esa composición (extraer HOG antes
 * de entrenar/predecir) — cualquier lógica de distancia/votación vive en
 * `KNNClassifier`, cualquier fórmula de gradiente/histograma vive en
 * `extractHOG`.
 */
export class CharacterClassifier {
  private readonly knn = new KNNClassifier();

  train(characters: LabeledCharacter[]): void {
    const descriptors = characters.map((character) => extractHOG(character.imageData));
    const labels = characters.map((character) => character.label);
    this.knn.train(descriptors, labels);
  }

  predict(imageData: ImageData, k?: number): CharacterPrediction {
    const descriptor = extractHOG(imageData);
    const { label, confidence, topN } = k === undefined ? this.knn.predict(descriptor) : this.knn.predict(descriptor, k);
    return { label, confidence, topN };
  }
}
